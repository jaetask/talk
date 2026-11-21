export const HOLD_CHARS = 300;

export class Hold {
  private held = "";
  private open = false;
  private said = false;
  private over = false;
  readonly dropped: string[] = [];
  constructor(public limit = HOLD_CHARS) {}

  text(piece: string): string {
    if (this.over) return "";
    if (this.open) return piece;
    this.held += piece;
    if (this.held.length < this.limit) return "";
    const out = this.held;
    this.held = "";
    this.open = true;
    this.said = true;
    return out;
  }
  tool(): void {
    if (this.held.trim()) this.dropped.push(this.held.trim());
    this.held = "";
    this.open = false;
  }
  keep(): string {
    const out = this.held;
    this.held = "";
    this.open = false;
    this.said = this.said || Boolean(out.trim());
    this.over = this.said;
    return out;
  }
  silence(): void {
    this.held = "";
    this.dropped.length = 0;
    this.over = true;
  }
  end(): string {
    let out = this.held;
    this.held = "";
    if (!out.trim() && !this.said && this.dropped.length) out = this.dropped.pop()!;
    return out;
  }
}
