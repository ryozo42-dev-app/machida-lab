declare module "puppeteer-core" {
  type LaunchOptions = {
    executablePath?: string;
    headless?: boolean | "shell";
    args?: string[];
    defaultViewport?: {
      width: number;
      height: number;
      deviceScaleFactor?: number;
    };
  };

  type Page = {
    setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
    pdf(options?: Record<string, unknown>): Promise<Buffer>;
  };

  type Browser = {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  };

  export function launch(options?: LaunchOptions): Promise<Browser>;
  export function defaultArgs(options?: { args?: string[]; headless?: boolean | "shell" }): string[];

  const puppeteer: {
    launch: typeof launch;
    defaultArgs: typeof defaultArgs;
  };

  export default puppeteer;
}

declare module "@sparticuz/chromium-min" {
  const chromium: {
    args: string[];
    executablePath(packLocation?: string): Promise<string>;
  };

  export default chromium;
}
