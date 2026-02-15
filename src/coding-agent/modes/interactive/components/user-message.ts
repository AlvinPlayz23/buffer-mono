import { Container, Markdown, type MarkdownTheme, Spacer } from "#buffer-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder((line) => theme.fg("borderMuted", line)));
		this.addChild(
			new Markdown(text, 1, 1, markdownTheme, {
				color: (text: string) => theme.fg("muted", text),
			}),
		);
		this.addChild(new DynamicBorder((line) => theme.fg("borderMuted", line)));
	}
}
