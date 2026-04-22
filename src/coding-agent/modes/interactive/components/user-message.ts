import { Container, Markdown, type MarkdownTheme, Spacer } from "#buffer-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { LeftBar } from "./left-bar.js";

/**
 * Component that renders a user message with a left accent bar
 */
export class UserMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(new Spacer(1));

		const bar = new LeftBar((s) => theme.fg("borderAccent", s));
		bar.addChild(
			new Markdown(text, 0, 0, markdownTheme, {
				color: (text: string) => theme.fg("muted", text),
			}),
		);
		this.addChild(bar);
	}
}
