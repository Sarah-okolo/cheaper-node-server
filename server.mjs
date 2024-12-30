import express from "express";
import puppeteer from "puppeteer-core";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get("/", (req, res) => {
    console.log("Server is running...");
    res.send("Cheaperr scraping server is running...");
});

const URLS = {
    amazon: "https://www.amazon.com/",
    ebay: "https://www.ebay.com/",
    aliexpress: "https://www.aliexpress.com/",
};

const BROWSER_WSE_ENDPOINT = "wss://brd-customer-hl_22b15088-zone-cheaperr_app_scraping_browser:zv9bdp919qwa@brd.superproxy.io:9222";

app.get("/scrape", async (req, res) => {
    const { search, site } = req.query;

    console.log(`Received request for search: ${search}, site: ${site}`);

    if (!search || !site || !URLS[site]) {
        console.log("Missing or invalid search term or site");
        return res.status(400).json({ error: "Missing or invalid search term or site" });
    }

    try {
        const selectors = {
            amazon: {
                productContainer: ".s-card-container",
                url: "a",
                title: "a h2 span",
                price: ".a-price > .a-offscreen",
                image: "img",
                sponsored: ".puis-sponsored-label-text",
                site: "Amazon",
            },
            ebay: {
                productContainer: "li .s-item__wrapper",
                url: ".s-item .s-item__link",
                title: ".s-item__link .s-item__title span",
                price: ".s-item__price",
                image: ".s-item__image a .s-item__image-wrapper img",
                sponsored: ".s-item__title-tag",
                site: "eBay",
            },
            aliexpress: {
                productContainer: ".card-out-wrapper",
                url: "a",
                title: "a h3",
                price: ".multi--price-sale--U-S0jtj",
                image: ".images--imageWindow--1Z-J9gn img",
                sponsored: ".product-card .product-card__ad-badge",
                site: "AliExpress",
            },
        };

        const scrapeWebsite = async (url, selectors) => {
            const browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WSE_ENDPOINT });
            console.log('Connected to scraping browser');
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(3 * 60 * 1000);

            try {
                console.log(`Navigating to ${url}`);
                await page.goto(url, { waitUntil: "domcontentloaded" });

                // Perform search and sort results for requested site
                if (url.includes("amazon")) {
                    console.log("Typing search term into Amazon search box");
                    await page.waitForSelector("#twotabsearchtextbox");
                    await page.type("#twotabsearchtextbox", search);
                    await page.keyboard.press("Enter");
                    console.log("Sorting results by price");
                    await page.waitForSelector("#s-result-sort-select");
                    await page.select("#s-result-sort-select", "price-asc-rank");
                } else if (url.includes("ebay")) {
                    console.log("Typing search term into eBay search box");
                    await page.waitForSelector("#gh-ac");
                    await page.type("#gh-ac", search);
                    await page.keyboard.press("Enter");
                } else if (url.includes("aliexpress")) {
                    console.log("Typing search term into AliExpress search box");
                    await page.waitForSelector("#search-words");
                    await page.type("#search-words", search);
                    await page.keyboard.press("Enter");
                }

                console.log("Waiting for product listings");
                await page.waitForSelector(selectors.productContainer);

                // Extract product data from page
                const data = await page.evaluate((selectors) => {
                    console.log("Extracting product data from page");
                    return Array.from(document.querySelectorAll(selectors.productContainer))
                        .slice(0, 20)
                        .map(el => {
                            const url = el.querySelector(selectors.url)?.getAttribute("href");
                            const title = el.querySelector(selectors.title)?.innerText.trim();
                            const price = el.querySelector(selectors.price)?.innerText.trim();
                            const image = el.querySelector(selectors.image)?.src;
                            const sponsored = el.querySelector(selectors.sponsored);

                            if (!price || sponsored) {
                                return null;
                            }

                            return { url, title, price, image, site: selectors.site };
                        })
                        .filter(item => item !== null);
                }, selectors);

                return data;
            } finally {
                await page.close();
                await browser.close();
                console.log("Scraping Page and Browser closed");
            }
        };

        const url = URLS[site];
        console.log(`Scraping data from ${url}`);
        const data = await scrapeWebsite(url, selectors[site]);

        res.json(data);
        console.log(`${data.length} - data sent to client from - ${site}`);
        console.log("Awaiting next request...");
    } catch (error) {
        console.error("Error during scraping:", error);
        res.status(500).json({ error: "Failed to scrape data" });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));