import type { TUI } from "#buffer-tui";
import { Text } from "#buffer-tui";

/**
 * Animated wave block loader: ▁▂▃ thinking
 */
export class WaveLoader extends Text {
	private frames = ["▁▂▃", "▂▃▁", "▃▁▂"];
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;

	constructor(
		ui: TUI,
		private colorFn: (str: string) => string,
		private messageFn: (str: string) => string,
		private message: string = "thinking",
	) {
		super("", 1, 0);
		this.ui = ui;
		this.start();
	}

	render(width: number): string[] {
		return ["", "", ...super.render(width)];
	}

	start() {
		this.updateDisplay();
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, 200);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	setMessage(message: string) {
		this.message = message;
		this.updateDisplay();
	}

	private updateDisplay() {
		const frame = this.frames[this.currentFrame];
		this.setText(`${this.colorFn(frame)} ${this.messageFn(this.message)}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}
