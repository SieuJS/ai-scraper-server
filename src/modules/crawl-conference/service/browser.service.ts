import { Injectable } from "@nestjs/common";
import { JSDOM } from "jsdom";
import * as puppeteer from "puppeteer";
import { Browser } from "puppeteer";
import * as SocketIOClient from "socket.io-client";
const MAX_TIMEOUT = 15000;

@Injectable()
export class BrowserService {
    public browser: puppeteer.Browser;
    public socket: SocketIOClient.Socket;
    async init() {
        this.browser = await puppeteer.launch();
        this.socket = await SocketIOClient.connect("http://0.0.0.0:9090");
    }

    async close() {
        await this.browser.close();
        await this.socket.offAny();
        await this.socket.close();
    }

    async newPage() {
        return await this.browser.newPage();
    }
    async callForCrawlConference(browser: Browser, link: string) {
        let bodyText = (await this.saveHTMLContent(browser, link)) || "";
        let response = "";

        response = await new Promise((resolve, reject) => {
            setTimeout(() => {
                reject("Out of time");
            }, MAX_TIMEOUT);
            this.socket.emit("extractCrawlData", bodyText, (res: any) => {
                console.log("response at socket", res);
                resolve(res);
            });
        });
        response = JSON.parse(response);

        console.log("response", response);
        return response;
    }

    async saveHTMLContent(browser: Browser, link: string): Promise<string> {
        try {
            const page = await browser.newPage();
            await page.goto(link, { waitUntil: "domcontentloaded" });

            const htmlContent = await page.content();

            await page.close();
            return this.extractTextFromHTML(htmlContent);
        } catch (error) {
            console.log("Error in saveHTMLContent:", error);
            return "";
        }
    }

    extractTextFromHTML(htmlContent: string): string {
        try {
            const document = this.cleanDOM(htmlContent);

            let fullText = this.traverseNodes(document.body);

            fullText = this.removeExtraEmptyLines(fullText);

            return fullText;
        } catch (error) {
            console.log("Error in extractTextFromHTML:", error);
            return "";
        }
    }

    cleanDOM(htmlContent: string): Document {
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;

        // Remove all <script> and <style> tags
        const scripts = document.querySelectorAll("script");
        scripts.forEach((script) => script.remove());

        const styles = document.querySelectorAll("style");
        styles.forEach((style) => style.remove());

        return document;
    }

    traverseNodes(node: HTMLElement): string {
        let text = "";

        if (node.nodeType === 3) {
            // Text node
            const trimmedText = this.normalizeTextNode(
                node.textContent?.trim() || ""
            );
            if (trimmedText) {
                text += trimmedText + " ";
            }
        } else if (node.nodeType === 1) {
            // Element node
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            if (tagName === "table") {
                text += this.processTable(element);
            } else if (tagName === "li") {
                const childrenText: string[] = [];

                element.childNodes.forEach((child) => {
                    const childText = this.traverseNodes(
                        child as HTMLElement
                    ).trim();
                    if (childText) {
                        // Only process if there is content in the child element
                        childrenText.push(childText); // Save the child elements of <li>
                    }
                });

                if (childrenText.length > 0) {
                    text += childrenText.join(" | ") + "\n"; // Separate child elements with "|"
                }
            } else if (tagName === "br") {
                text += "\n"; // Add a newline when encountering <br>
            } else {
                element.childNodes.forEach((child) => {
                    text += this.traverseNodes(child as HTMLElement); // Recursively process child elements
                });

                // If it is <ul> or <ol>, only process if there are no <li> elements already processed
                if (tagName === "ul" || tagName === "ol") {
                    const liElements = element.querySelectorAll("li");
                    if (liElements.length === 0) {
                        text += this.processList(element as HTMLElement); // Process list if there are no <li> elements
                    }
                }
            }

            // Check block-level tags and handle newlines
            const blockLevelTags = [
                "p",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "blockquote",
                "section",
                "article",
                "header",
                "footer",
                "aside",
                "nav",
                "main",
            ];

            if (
                !blockLevelTags.includes(tagName) &&
                tagName !== "table" &&
                tagName !== "ul" &&
                tagName !== "ol"
            ) {
                text += " "; // Add a space if not a block-level element or table
            }

            if (
                blockLevelTags.includes(tagName) ||
                (tagName === "div" && element.closest("li") === null)
            ) {
                text += "\n"; // Add a newline for block-level elements
            }
        }

        return text;
    }

    private normalizeTextNode(text: string | null): string {
        // Remove unnecessary line breaks between words without punctuation
        if (!text) return "";
        text = text.replace(/([a-zA-Z0-9]),?\n\s*([a-zA-Z0-9])/g, "$1 $2");

        // Remove line breaks without punctuation before (period, question mark, exclamation mark)
        text = text.replace(/([^\.\?\!])\n\s*/g, "$1 ");

        // Normalize excessive whitespace
        text = text.replace(/\s+/g, " ");

        return text.trim();
    }

    private removeExtraEmptyLines(text: string | null): string {
        if (!text) return "";
        return text.replace(/\n\s*\n\s*\n/g, "\n\n");
    }

    private processTable(table: HTMLElement): string {
        let tableText = "";
        const rows = table.querySelectorAll("tr");
        if (rows.length === 0) return tableText;

        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll("td, th");
            if (rowIndex === 0) {
                tableText += "\n"; // Add a new line before the first row
            }

            let rowText = "";
            cells.forEach((cell, index) => {
                const cellText = this.traverseNodes(cell as HTMLElement).trim(); // Call traverseNodes to process child elements in td/th
                if (cellText) {
                    // Only process if there is content in the td/th
                    if (index === cells.length - 1) {
                        rowText += cellText; // Do not add a separator for the last cell
                    } else {
                        rowText += cellText + " | "; // Add a separator between cells
                    }
                }
            });

            if (rowText.trim()) {
                // Only add the row if there is content
                tableText += rowText + "\n"; // Add a newline after each row
            }
        });

        return tableText + "\n"; // Separate tables with a newline
    }

    private processList(list: HTMLElement): string {
        let listText = "";
        list.querySelectorAll("li").forEach((li) => {
            const liText = this.traverseNodes(li).trim();
            if (liText) {
                // Only process if there is content in the li
                listText += "--- " + liText + "\n"; // Add "---" before each li
            }
        });
        return listText + "\n";
    }
}
