import {JSDOM} from "jsdom";
import { Browser } from "puppeteer";
import * as SocketIOClient from "socket.io-client";
import * as fs from 'fs';
import * as path from 'path';

const MAX_TIMEOUT = 15000;

export class CrawlConferenceService {
    private owner: string;
    private socket: SocketIOClient.Socket;


    async getOwner(): Promise<string> {
        return this.owner;
    }

    async callForCrawlConference(browser: Browser, link: string) {
        let bodyText = (await this.saveHTMLContent(browser, link)) || "";
        const filePath = path.join(__dirname, 'acm.txt');
        await fs.writeFileSync(filePath, bodyText, 'utf8');
        let response = "";
        this.socket = await SocketIOClient.connect("http://0.0.0.0:9090");
        response = await new Promise((resolve, reject) => {
            setTimeout(() => {
                reject("Out of time");
            }, MAX_TIMEOUT);
            this.socket.emit("extractCrawlData", bodyText, (res: any) => {
                console.log("response at socket", res);
                resolve(res);
            });
            this.socket.offAny();
        });
        let parsedResponse = await JSON.parse(response) as Array<[string, string]>;

        const remappedResponse = parsedResponse.reduce((acc: any, [key, value]: [string, string]) => {
            const dateType = key.replace('Name', '');
            if (!acc[dateType]) {
            acc[dateType] = [];
            }
            if (key.endsWith('Name')) {
            acc[dateType].push({ name: value, date: '' });
            } else {
            const lastEntry = acc[dateType][acc[dateType].length - 1];
            if (lastEntry && !lastEntry.date) {
                lastEntry.date = value;
            } else {
                acc[dateType].push({ name: '', date: value });
            }
            }
            return acc;
        }, {});


        response = remappedResponse;

        console.log("response", response);
        return response;
    }

    saveHTMLContent = saveHTMLContent;
    extractTextFromHTML = extractTextFromHTML;
    cleanDOM = cleanDOM;
    traverseNodes = traverseNodes;
    normalizeTextNode = normalizeTextNode;
    removeExtraEmptyLines = removeExtraEmptyLines;
    processTable = processTable;
    
}

async function saveHTMLContent(browser: Browser, link: string): Promise<string> {
    try {
        const page = await browser.newPage();
        await page.goto(link, { waitUntil: "domcontentloaded" });

        const htmlContent = await page.content();

        await page.close();
        return extractTextFromHTML(htmlContent);
    } catch (error) {
        console.log("Error in saveHTMLContent:", error);
        return "";
    }
}

function extractTextFromHTML(htmlContent: string): string {
    try {
        const document = cleanDOM(htmlContent);

        let fullText = traverseNodes(document.body);

        fullText = removeExtraEmptyLines(fullText);

        return fullText;
    } catch (error) {
        console.log("Error in extractTextFromHTML:", error);
        return "";
    }
}

function cleanDOM(htmlContent: string): Document {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    // Remove all <script> and <style> tags
    const scripts = document.querySelectorAll("script");
    scripts.forEach((script) => script.remove());

    const styles = document.querySelectorAll("style");
    styles.forEach((style) => style.remove());

    return document;
}

function traverseNodes(node: HTMLElement): string {
    let text = "";

    if (node.nodeType === 3) {
        // Text node
        const trimmedText = normalizeTextNode(
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
            text += processTable(element);
        } else if (tagName === "li") {
            const childrenText: string[] = [];

            element.childNodes.forEach((child) => {
                const childText = traverseNodes(
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
                text += traverseNodes(child as HTMLElement); // Recursively process child elements
            });

            // If it is <ul> or <ol>, only process if there are no <li> elements already processed
            if (tagName === "ul" || tagName === "ol") {
                const liElements = element.querySelectorAll("li");
                if (liElements.length === 0) {
                    text += processList(element as HTMLElement); // Process list if there are no <li> elements
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

function normalizeTextNode(text: string | null): string {
    // Remove unnecessary line breaks between words without punctuation
    if (!text) return "";
    text = text.replace(/([a-zA-Z0-9]),?\n\s*([a-zA-Z0-9])/g, "$1 $2");

    // Remove line breaks without punctuation before (period, question mark, exclamation mark)
    text = text.replace(/([^\.\?\!])\n\s*/g, "$1 ");

    // Normalize excessive whitespace
    text = text.replace(/\s+/g, " ");

    return text.trim();
}

function removeExtraEmptyLines(text: string | null): string {
    if (!text) return "";
    return text.replace(/\n\s*\n\s*\n/g, "\n\n");
}

function processTable(table: HTMLElement): string {
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
            const cellText = traverseNodes(cell as HTMLElement).trim(); // Call traverseNodes to process child elements in td/th
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


function processList(list: HTMLElement): string {
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