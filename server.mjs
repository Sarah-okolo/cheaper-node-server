import express from "express";
import puppeteer from "puppeteer-core";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());

const URLS = {
    amazon: "https://www.amazon.com/",
    ebay: "https://www.ebay.com/",
    aliexpress: "https://www.aliexpress.com/"
};

const BROWSER_WSE_ENDPOINT = "wss://brd-customer-hl_22b15088-zone-cheaperr_app_scraping_browser:zv9bdp919qwa@brd.superproxy.io:9222";

app.get("/", (req, res) => {
    res.send("Cheaperr scraping server is running...");
});

app.get("/scrape", async (req, res) => {
    const searchTerm = req.query.search;
    if (!searchTerm) {
        return res.status(400).json({ error: "Missing search term" });
    }

    try {
        const browser = await puppeteer.connect({
            browserWSEndpoint: BROWSER_WSE_ENDPOINT
        });
        console.log("Connected to browser...");

        // Function to scrape a single website
        const scrapeWebsite = async (url, selectors) => {
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(3 * 60 * 1000); // Increase timeout

            try {
                await page.goto(url, { waitUntil: "domcontentloaded" });
                console.log(`Navigated to ${url}`);

                if (url.includes("amazon")) {
                    await page.waitForSelector("#twotabsearchtextbox", { timeout: 30000 });
                    await page.type("#twotabsearchtextbox", searchTerm);
                    await page.keyboard.press("Enter");
                    await page.waitForSelector("#s-result-sort-select", { timeout: 30000 });
                    await page.select("#s-result-sort-select", "price-asc-rank");
                } else if (url.includes("ebay")) {
                    await page.waitForSelector("#gh-ac", { timeout: 30000 });
                    await page.type("#gh-ac", searchTerm);
                    await page.keyboard.press("Enter");
                } else if (url.includes("aliexpress")) {
                    await page.waitForSelector("#search-words", { timeout: 30000 });
                    await page.type("#search-words", searchTerm);
                    await page.keyboard.press("Enter");
                }

                await page.waitForSelector(selectors.productContainer, { timeout: 30000 });
                const data = await page.evaluate((selectors) => {
                    return Array.from(document.querySelectorAll(selectors.productContainer)).map(el => ({
                        url: el.querySelector(selectors.url)?.getAttribute("href"),
                        title: el.querySelector(selectors.title)?.innerText.trim(),
                        price: el.querySelector(selectors.price)?.innerText.trim(),
                        image: el.querySelector(selectors.image)?.src,
                        isSponsored: el.querySelector(selectors.sponsored) ? true : false,
                        site: selectors.site
                    }));
                }, selectors);

                await page.close();
                return data;
            } catch (error) {
                console.error(`Error scraping ${url}:`, error);
                await page.close();
                return [];
            }
        };

        const selectors = {
            amazon: {
                productContainer: ".s-card-container",
                url: "a",
                title: "a h2 span",
                price: ".a-price > .a-offscreen",
                image: "img",
                sponsored: ".puis-sponsored-label-text",
                site: "Amazon"
            },
            ebay: {
                productContainer: "li .s-item__wrapper",
                url: ".s-item .s-item__link",
                title: ".s-item__link .s-item__title span",
                price: ".s-item__price",
                image: ".s-item__image a .s-item__image-wrapper img",
                sponsored: ".s-item__title-tag",
                site: "eBay"
            },
            aliexpress: {
                productContainer: ".card-out-wrapper",
                url: "a",
                title: "a h3",
                price: ".multi--price-sale--U-S0jtj",
                image: ".images--imageWindow--1Z-J9gn img",
                sponsored: ".product-card .product-card__ad-badge",
                site: "AliExpress"
            }
        };

        const results = {};
        for (const [site, url] of Object.entries(URLS)) {
            results[site] = await scrapeWebsite(url, selectors[site]);
        }

        await browser.close();
        console.log("Scraping completed, browser closed");

        res.json(results);
    } catch (error) {
        console.error("Error during scraping:", error);
        res.status(500).json({ error: "Failed to scrape data" });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
