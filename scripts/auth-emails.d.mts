export declare const LINK_BASE: string;
export declare function confirmLink(type: string, base?: string): string;
export declare function authEmails(base?: string): Record<string, string>;
export declare function email(o: { title: string; text: string; button: string; url: string; base?: string }): string;
