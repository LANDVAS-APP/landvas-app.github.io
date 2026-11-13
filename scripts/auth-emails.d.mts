export declare const LINK_BASE: string;
export declare const ART_WIDTH: number;
export declare const COPY: Record<string, { subject: string; type: string; title: string; text: string; button: string }>;
export declare const SHARED: Record<string, string>;
export declare function emailArt(): Record<string, { file: string; width: number; height: number; text: string; kind: string }>;
export declare function confirmLink(type: string, base?: string): string;
export declare function authEmails(base?: string): Record<string, string>;
export declare function artUrls(base?: string): string[];
export declare function email(id: string, url: string, base?: string): string;
