import express from "express";
import puppeteer from "puppeteer-core";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors({
    origin: "https://cheaperr.netlify.app",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
}));
app.options('*', cors());

app.get("/", (req, res) => {
    res.send("Cheaperr scraping server is running...");
});

const URLS = {
    amazon: "https://www.amazon.com/",
    ebay: "https://www.ebay.com/",
    aliexpress: "https://www.aliexpress.com/",
};

const BROWSER_WSE_ENDPOINT = "wss://brd-customer-hl_22b15088-zone-cheaperr_app_scraping_browser:zv9bdp919qwa@brd.superproxy.io:9222";

app.get("/scrape", async (req, res) => {
    const searchTerm = req.query.search;
    if (!searchTerm) {
        return res.status(400).json({ error: "Missing search term" });
    }

    try {
        // Scraping function
        const scrapeWebsite = async (url, selectors) => {
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(3 * 60 * 1000);

            try {
                await page.goto(url, { waitUntil: "domcontentloaded" });
                console.log(`Navigated to ${url}`);

                // Perform site-specific search logic
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

                // Extract data with a limit of 20 items
                const data = await page.evaluate((selectors) => {
                    return Array.from(document.querySelectorAll(selectors.productContainer))
                        .slice(0, 20) // Limit to 20 items
                        .map(el => {
                            const url = el.querySelector(selectors.url)?.getAttribute("href");
                            const title = el.querySelector(selectors.title)?.innerText.trim();
                            const price = el.querySelector(selectors.price)?.innerText.trim();
                            const image = el.querySelector(selectors.image)?.src;
                            const sponsored = el.querySelector(selectors.sponsored); // Check if it's sponsored
                            const site = selectors.site;

                            // Filter out items that don't have a price or have a specific image or are sponsored
                            if (!price || sponsored || (selectors.site === "eBay" && image === "https://ir.ebaystatic.com/rs/v/fxxj3ttftm5ltcqnto1o4baovyl.png") || (selectors.site === "AliExpress" && !image)) {
                                return null; // Skip these items
                            }

                            return { url, title, price, image, site };
                        })
                        .filter(item => item !== null); // Remove null items (those filtered out)
                }, selectors);

                return data;
            } catch (error) {
                console.error(`Error scraping ${url}:`, error);
                return [];
            } finally {
                await page.close();
            }
        };

        // Selectors for each site
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

        const results = {};
        let browser;
        for (const [site, url] of Object.entries(URLS)) {
            console.log(`Starting to scrape ${site}...`);
            browser = await puppeteer.connect({
                browserWSEndpoint: BROWSER_WSE_ENDPOINT,
            });
            console.log("Connected to browser...");
            try {
                results[site] = await scrapeWebsite(url, selectors[site]);
            } finally {
                await browser.close();
                console.log(`Completed scraping ${site}. Browser closed.`);
            }
        }

        res.json(results);
        console.log("Data sent to client. Awaiting next request...");
    } catch (error) {
        console.error("Error during scraping:", error);
        res.status(500).json({ error: "Failed to scrape data" });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
