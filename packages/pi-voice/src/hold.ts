// Keeps a model's narration out of the reply. What the model says is spoken, and models say "I'll look that up"
// before a tool call whatever the prompt tells them. Text is held at the start of each model step: a tool call while
// it is held makes it narration and it is dropped; once it runs past the limit it is an answer and streams from
// there; at the end of the turn whatever is held is the answer.
export const HOLD_CHARS = 300;

export class Hold {
	private held = "";
	private open = false;
	private said = false;
	private over = false;
	readonly dropped: string[] = [];
	constructor(private readonly limit = HOLD_CHARS) {}

	/** Take a piece of text; return what may be shown and spoken now ("" while holding). */
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
	/** A tool call: what was held was said on the way to it. */
	tool(): void {
		if (this.held.trim()) this.dropped.push(this.held.trim());
		this.held = "";
		this.open = false;
	}
	/** Ending the call comes after the answer: what was held is the answer, said before it. */
	keep(): string {
		const out = this.held;
		this.held = "";
		this.open = false;
		this.said = this.said || Boolean(out.trim());
		this.over = this.said;
		return out;
	}
	/** The agent chose to say nothing this turn: whatever it wrote on the way is not spoken. */
	silence(): void {
		this.held = "";
		this.dropped.length = 0;
		this.over = true;
	}
	/** The turn is over. A turn is never left silent: if all it said came before a tool call, that is the answer. */
	end(): string {
		let out = this.held;
		this.held = "";
		if (!out.trim() && !this.said && this.dropped.length) out = this.dropped.pop()!;
		return out;
	}
}
