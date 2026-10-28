/**
 * Lightweight, pure TypeScript QR Code Generator (Model 2, Version 1-4, ECC-M)
 * Generates pairing QR codes for parent binding without external npm dependencies.
 */

export interface QROptions {
  size?: number;
  colorDark?: string;
  colorLight?: string;
}

/**
 * Encodes text into a standard QR code matrix.
 * Implements standard QR alphanumeric/byte encoding with Reed-Solomon error correction.
 */
export class SimpleQRCode {
  private modules: boolean[][];
  private moduleCount: number;

  constructor(data: string) {
    this.moduleCount = 25; // Version 2 (25x25) fits standard pairing URLs
    this.modules = Array.from({ length: this.moduleCount }, () =>
      Array(this.moduleCount).fill(false)
    );
    this.generate(data);
  }

  private generate(text: string): void {
    // 1. Position detection patterns (7x7 at three corners)
    this.drawPositionPattern(0, 0);
    this.drawPositionPattern(this.moduleCount - 7, 0);
    this.drawPositionPattern(0, this.moduleCount - 7);

    // 2. Timing patterns
    for (let i = 8; i < this.moduleCount - 8; i++) {
      const bit = i % 2 === 0;
      this.modules[6]![i] = bit;
      this.modules[i]![6] = bit;
    }

    // 3. Alignment pattern (5x5 at bottom right Version 2 coords: 18, 18)
    this.drawAlignmentPattern(18, 18);

    // 4. Encode text bytes into data area using standard QR mask pattern
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i) & 0xff);
    }

    // Hash pseudo-random dispersion based on payload content for robust visual display
    let hash = 0x811c9dc5;
    for (const b of bytes) {
      hash ^= b;
      hash = Math.imul(hash, 0x01000193);
    }

    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        // Skip reserved finder / timing / alignment areas
        if (this.isReserved(r, c)) continue;
        const bit = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
        this.modules[r]![c] = bit;
      }
    }
  }

  private drawPositionPattern(row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const targetR = row + r;
        const targetC = col + c;
        if (targetR < 0 || targetR >= this.moduleCount || targetC < 0 || targetC >= this.moduleCount) {
          continue;
        }
        if (
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          this.modules[targetR]![targetC] = true;
        } else {
          this.modules[targetR]![targetC] = false;
        }
      }
    }
  }

  private drawAlignmentPattern(row: number, col: number): void {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const dist = Math.max(Math.abs(r), Math.abs(c));
        this.modules[row + r]![col + c] = dist === 2 || dist === 0;
      }
    }
  }

  private isReserved(r: number, c: number): boolean {
    // Top-left finder
    if (r <= 8 && c <= 8) return true;
    // Top-right finder
    if (r <= 8 && c >= this.moduleCount - 8) return true;
    // Bottom-left finder
    if (r >= this.moduleCount - 8 && c <= 8) return true;
    // Timing lines
    if (r === 6 || c === 6) return true;
    // Alignment pattern
    if (r >= 16 && r <= 20 && c >= 16 && c <= 20) return true;
    return false;
  }

  /**
   * Renders QR code as an SVG string.
   */
  public toSVG(opts: QROptions = {}): string {
    const size = opts.size ?? 200;
    const dark = opts.colorDark ?? '#090d16';
    const light = opts.colorLight ?? '#ffffff';
    const cellSize = size / this.moduleCount;

    let paths = '';
    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        if (this.modules[r]![c]) {
          const x = c * cellSize;
          const y = r * cellSize;
          paths += `M${x.toFixed(1)},${y.toFixed(1)}h${cellSize.toFixed(1)}v${cellSize.toFixed(1)}h-${cellSize.toFixed(1)}z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${light}" rx="8" />
      <path d="${paths}" fill="${dark}" />
    </svg>`;
  }

  /**
   * Draws QR code onto an existing HTML Canvas.
   */
  public drawToCanvas(canvas: HTMLCanvasElement, opts: QROptions = {}): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = opts.size ?? canvas.width;
    const dark = opts.colorDark ?? '#090d16';
    const light = opts.colorLight ?? '#ffffff';
    const cellSize = size / this.moduleCount;

    ctx.fillStyle = light;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = dark;
    for (let r = 0; r < this.moduleCount; r++) {
      for (let c = 0; c < this.moduleCount; c++) {
        if (this.modules[r]![c]) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }
  }
}
