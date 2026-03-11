export class MockThemeColor {
  constructor(public readonly id: string) {}
}

export class MockThemeIcon {
  constructor(public readonly id: string, public readonly color?: MockThemeColor) {}
}

class MockTreeItem {
  contextValue?: string;
  description?: string;
  iconPath?: MockThemeIcon;
  tooltip?: string;
  constructor(public readonly label: string, public readonly collapsibleState: number) {}
}

export const vscodeMock = {
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState: { None: 0 },
  ThemeIcon: MockThemeIcon,
  ThemeColor: MockThemeColor,
};
