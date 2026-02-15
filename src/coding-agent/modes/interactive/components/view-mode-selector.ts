import { Container, type SelectItem, SelectList } from "#buffer-tui";
import { getSelectListTheme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export type ViewModeValue = "alt-mode" | "text-buffer";

/**
 * Selector for choosing terminal view mode.
 */
export class ViewModeSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(currentValue: ViewModeValue, onSelect: (mode: ViewModeValue) => void, onCancel: () => void) {
		super();

		const items: SelectItem[] = [
			{ value: "alt-mode", label: "alt-mode", description: "Use terminal alternate screen (clean scrollback)" },
			{ value: "text-buffer", label: "text-buffer", description: "Render in normal terminal buffer (keeps scrollback)" },
		];

		this.addChild(new DynamicBorder());

		this.selectList = new SelectList(items, 5, getSelectListTheme());
		this.selectList.setSelectedIndex(currentValue === "alt-mode" ? 0 : 1);
		this.selectList.onSelect = (item) => onSelect(item.value as ViewModeValue);
		this.selectList.onCancel = onCancel;

		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
