const puppeteer = require("puppeteer");
const fs = require("fs");
require("dotenv").config();
const { JSDOM } = require("jsdom");

// Hàm lấy danh sách hội nghị từ ICORE Conference Portal
const getConferenceList = (browser) =>
  new Promise(async (resolve, reject) => {
    try {
      let currentLink = `${process.env.PORTAL}?search=&by=${process.env.BY}&source=${process.env.CORE2023}&sort=${process.env.SORT}&page=${process.env.PAGE}`;
      console.log("Crawling conference list from:", currentLink);

      // Lấy tổng số trang
      const totalPages = await getTotalPages(browser, currentLink);

      // Mảng chứa danh sách tất cả hội nghị
      let allConferences = [];

      // Lặp qua từng trang và trích xuất dữ liệu hội nghị
      for (let i = 1; i <= totalPages; i++) {
        let conferencesOnPage = await getConferencesOnPage(
          browser,
          currentLink.slice(0, -1) + i
        );
        allConferences = allConferences.concat(conferencesOnPage);
      }

      resolve(allConferences);
    } catch (error) {
      console.log("Error in getConferenceList:", error);
      reject(error);
    }
  });

// Hàm tìm kiếm các liên kết trang web của hội nghị trên Google
const searchConferenceLinks = async (browser, conference) => {
  try {
    // Số lượng liên kết tối đa cần thu thập
    const maxLinks = 4;
    // Mảng chứa các liên kết
    let links = [];

    // Mở tab mới
    let page = await browser.newPage();

    // Tìm kiếm trên Google với từ khóa là Title + 2023
    await page.goto("https://www.google.com/");
    await page.waitForSelector("#APjFqb");
    await page.keyboard.sendCharacter(conference.Title + "  " + conference.Acronym + " 2023");
    await page.keyboard.press("Enter");
    await page.waitForNavigation();
    await page.waitForSelector("#search");

    while (links.length < maxLinks) {
      const linkList = await page.$$eval("#search a", (els) => {
        const result = [];
        const unwantedDomains = [
          "scholar.google",
          "translate.google",
          "google.com",
          "wikicfp.com",
          "dblp.org",
          "medium.com",
          "dl.acm.org",
          "easychair.org",
          "youtube.com",
          "https://portal.core.edu.au/conf-ranks/",
          "facebook.com",
          "amazon.com",
          "wikipedia.org",
        ];
        for (const el of els) {
          const href = el.href;

          // === Loại trừ năm 2024 hoặc 24 trong URL ===
          if (href.includes("2024") || href.includes("24")) {
            continue; // Bỏ qua liên kết này
          }

          // Kiểm tra xem liên kết có chứa tên miền không mong muốn
          if (!unwantedDomains.some((domain) => href.includes(domain))) {
            result.push({
              link: href,
            });
          }
        }
        return result;
      });

      links = links.concat(linkList.map((item) => item.link));

      // Nếu links có nhiều hơn maxLinks, cắt bớt
      if (links.length > maxLinks) {
        links = links.slice(0, maxLinks);
      }

      if (links.length < maxLinks) {
        // Chưa đủ liên kết, tiếp tục tìm kiếm bằng cách cuộn xuống
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(2000);
      }
    }

    await page.close();

    return links.slice(0, maxLinks);
  } catch (error) {
    console.log("Error in searchConferenceLinks:", error);
  }
};

// Hàm lưu trữ thông tin HTML của trang web
const saveHTMLContent = async (browser, conference, links) => {
  try {
    const linksData = {
      title: conference.Title,
      conference: conference.Acronym,
      links: links,
    };

    if (!fs.existsSync("./link-data")) {
      fs.mkdirSync("./link-data");
    }

    const linksFilename = `./link-data/${conference.Acronym}_links.json`;
    fs.writeFileSync(linksFilename, JSON.stringify(linksData, null, 2));
    console.log(`Saved links to: ${linksFilename}`);

    for (let i = 0; i < links.length; i++) {
      const page = await browser.newPage();
      await page.goto(links[i], { waitUntil: "domcontentloaded" });

      // Lấy nội dung HTML của toàn bộ trang web
      const htmlContent = await page.content();

      // // Kiểm tra và tạo thư mục page-data nếu chưa tồn tại
      // if (!fs.existsSync("./page-data")) {
      //   fs.mkdirSync("./page-data");
      // }

      // // Lưu HTML vào thư mục page-data
      // const htmlFilename = `./page-data/${conference.Acronym}_${i}.html`;
      // fs.writeFileSync(htmlFilename, htmlContent);
      // console.log(`Saved HTML content to: ${htmlFilename}`);

      // Lọc và trích xuất văn bản từ HTML của toàn bộ trang web
      const outputFilePath = `./text-from-html-data/${conference.Acronym}_${i}.txt`;
      extractTextFromHTML(htmlContent, outputFilePath);

      // Lấy thông tin từ các tab "Call for Paper"
      await saveHTMLFromCallForPapers(page, conference, i);

      await page.close();
    }
  } catch (error) {
    console.log("Error in saveHTMLContent:", error);
  }
};



const cleanDOM = (htmlContent) => {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  // Loại bỏ tất cả các thẻ <script> và <style>
  const scripts = document.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  const styles = document.querySelectorAll('style');
  styles.forEach(style => style.remove());

  return document;
};


const normalizeTextNode = (text) => {
  // Loại bỏ dấu xuống dòng không cần thiết giữa các từ mà không có dấu câu
  text = text.replace(/([a-zA-Z0-9]),?\n\s*([a-zA-Z0-9])/g, '$1 $2');

  // Loại bỏ dấu xuống dòng không có dấu ngắt câu phía trước (dấu chấm, dấu chấm hỏi, dấu chấm than)
  text = text.replace(/([^\.\?\!])\n\s*/g, '$1 ');

  // Chuẩn hóa khoảng trắng dư thừa
  text = text.replace(/\s+/g, ' ');

  return text.trim();
};

// Hàm xử lý bảng (table)
const processTable = (table) => {
  let tableText = '';
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return tableText;

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('td, th');
    if (rowIndex === 0) {
      tableText += '\n'; // Thêm dòng mới trước dòng đầu tiên
    }

    let rowText = '';
    cells.forEach((cell, index) => {
      const cellText = traverseNodes(cell).trim(); // Gọi hàm traverseNodes để duyệt qua các thẻ con trong td/th
      if (cellText) { // Chỉ xử lý khi có nội dung trong thẻ td/th
        if (index === cells.length - 1) {
          rowText += cellText; // Không thêm dấu ngăn cách cho ô cuối cùng
        } else {
          rowText += cellText + ' | '; // Thêm dấu ngăn cách giữa các ô
        }
      }
    });

    if (rowText.trim()) { // Chỉ thêm dòng nếu có nội dung
      tableText += rowText + '\n'; // Thêm dấu xuống dòng sau mỗi hàng
    }
  });

  return tableText + '\n'; // Ngăn cách giữa các bảng
};

// Hàm xử lý danh sách ul/ol
const processList = (list) => {
  let listText = '';
  list.querySelectorAll('li').forEach(li => {
    const liText = traverseNodes(li).trim();
    if (liText) { // Chỉ xử lý khi có nội dung trong thẻ li
      listText += '--- ' + liText + "\n"; // Thêm dấu "---" trước mỗi li
    }
  });
  return listText + '\n';
};

// Hàm đệ quy để duyệt qua các phần tử và xử lý chúng
const traverseNodes = (node) => {
  let text = '';

  if (node.nodeType === 3) { // Text node
    const trimmedText = normalizeTextNode(node.textContent.trim());
    if (trimmedText) {
      text += trimmedText + ' ';
    }
  } else if (node.nodeType === 1) { // Element node
    const tagName = node.tagName.toLowerCase();

    if (tagName === 'table') {
      text += processTable(node);
    } else if (tagName === 'li') {
      const childrenText = [];

      node.childNodes.forEach(child => {
        const childText = traverseNodes(child).trim();
        if (childText) { // Chỉ xử lý khi có nội dung trong thẻ con
          childrenText.push(childText); // Lưu lại các thẻ con của <li>
        }
      });

      if (childrenText.length > 0) {
        text += childrenText.join(' | ') + '\n'; // Ngăn cách giữa các thẻ con bằng "|"
      }
    } else if (tagName === 'br') {
      text += '\n'; // Thêm dấu xuống dòng khi gặp thẻ <br>
    } else {
      node.childNodes.forEach(child => {
        text += traverseNodes(child); // Đệ quy xử lý các phần tử con
      });

      // Nếu là <ul> hoặc <ol>, chỉ xử lý khi không có <li> đã được xử lý
      if (tagName === 'ul' || tagName === 'ol') {
        const liElements = node.querySelectorAll('li');
        if (liElements.length === 0) {
          text += processList(node); // Xử lý danh sách nếu không có thẻ <li>
        }
      }
    }

    // Kiểm tra block-level tags và xử lý xuống dòng
    const blockLevelTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main'];

    if (!blockLevelTags.includes(tagName) && tagName !== 'table' && tagName !== 'ul' && tagName !== 'ol') {
      text += ' '; // Thêm dấu cách nếu không phải block-level hoặc bảng
    }

    if (blockLevelTags.includes(tagName) || (tagName === 'div' && node.closest('li') === null)) {
      text += '\n'; // Xuống dòng cho các thẻ block-level
    }
  }

  return text;
};
// Hàm để loại bỏ các hàng trống liên tiếp
const removeExtraEmptyLines = (text) => {
  return text.replace(/\n\s*\n\s*\n/g, '\n\n');
};

const extractTextFromHTML = (htmlContent, txtFilename) => {
  try {
    const document = cleanDOM(htmlContent);

    let fullText = traverseNodes(document.body);

    fullText = removeExtraEmptyLines(fullText);

    // Kiểm tra và tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync("./text-from-html-data")) {
      fs.mkdirSync("./text-from-html-data");
    }

    // Lưu văn bản trích xuất vào file .txt
    fs.writeFileSync(txtFilename, fullText.trim());
    console.log(`Saved extracted text to: ${txtFilename}`);
  } catch (error) {
    console.log("Error in extractTextFromHTML:", error);
  }
};

// Hàm lấy tổng số trang từ ICORE Conference Portal
async function getTotalPages(browser, url) {
  let page = await browser.newPage();
  await page.goto(url);

  const totalPages = await page.evaluate(() => {
    const pageElements = document.querySelectorAll("#search > a");
    let maxPage = 1;
    pageElements.forEach((element) => {
      const pageValue =
        element.textContent.length < 5
          ? parseInt(element.textContent)
          : null;
      if (!isNaN(pageValue) && pageValue > maxPage) {
        maxPage = pageValue;
      }
    });
    return maxPage;
  });

  await page.close();
  return totalPages;
}

// Hàm lấy dữ liệu hội nghị từ một trang của ICORE Conference Portal
const getConferencesOnPage = (browser, currentLink) =>
  new Promise(async (resolve, reject) => {
    try {
      let page = await browser.newPage();
      await page.goto(currentLink);
      await page.waitForSelector("#container");

      const scrapeData = [];
      const data = await page.$$eval("#search > table tr td", (tds) =>
        tds.map((td) => td.innerText)
      );

      let currentIndex = 0;
      while (currentIndex < data.length) {
        const obj = {
          Title: data[currentIndex],
          Acronym: data[currentIndex + 1],
          Source: data[currentIndex + 2],
          Rank: data[currentIndex + 3],
          Note: data[currentIndex + 4],
          DBLP: data[currentIndex + 5],
          PrimaryFoR: data[currentIndex + 6],
          Comments: data[currentIndex + 7],
          AverageRating: data[currentIndex + 8],
        };
        scrapeData.push(obj);
        currentIndex += 9;
      }

      await page.close();

      resolve(scrapeData);
    } catch (error) {
      reject(error);
    }
  });

async function testCrawler() {
  const browser = await puppeteer.launch();

  try {
    console.log("Starting crawler...");
    const allConferences = await getConferenceList(browser);

    for (const conference of allConferences) {
      console.log(`Crawling data for conference: ${conference.Acronym}`);

      const links = await searchConferenceLinks(browser, conference);
      await saveHTMLContent(browser, conference, links);
    }
  } catch (error) {
    console.error(`Error crawling data:`, error);
  } finally {
    await browser.close();
    console.log("Crawler finished.");
  }
}

testCrawler();
