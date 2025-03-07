#!/usr/bin/env node
const { chromium, errors } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class Scraper {
  constructor(username = null, password = null) {
    this.username = username;
    this.password = password;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // Helper function to dump HTML and tweet texts on timeout errors
  async dumpHtml(errorLocation) {
    try {
      const html = await this.page.content();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `error_${errorLocation}_${timestamp}.html`;
      await fs.writeFile(filename, html);
      console.error(`Dumped page HTML to ${filename}`);

      const tweetTexts = await this.page.evaluate(() => {
        const tweetElements = document.querySelectorAll('[data-testid="tweetText"]');
        return Array.from(tweetElements).map(el => el.innerText.trim());
      });

      const textFilename = `error_${errorLocation}_${timestamp}_tweets.txt`;
      await fs.writeFile(textFilename, JSON.stringify(tweetTexts, null, 2));
      console.error(`Dumped tweet texts to ${textFilename}`);
    } catch (err) {
      console.error(`Failed to dump HTML/tweets: ${err.message}`);
    }
  }

  async extractTweetContent(link) {
    console.log(`Processing: ${link}`);
    try {
      await this.page.goto(link, { waitUntil: 'networkidle' });
      
      try {
        await this.page.waitForSelector('article', { timeout: 10000 });
      } catch (error) {
        console.error(`Error waiting for article: ${error.message}`);
        await this.dumpHtml(`article_wait_${link.replace(/[^a-zA-Z0-9]/g, '_')}`);
        return null;
      }
      
      const content = await this.page.content();
      const tweetTexts = await this.page.evaluate(() => {
        const tweetElements = document.querySelectorAll('[data-testid="tweetText"]');
        return Array.from(tweetElements).map(el => el.innerText.trim());
      });

      return { content, tweetTexts };
    } catch (error) {
      console.error(`Error processing ${link}: ${error.message}`);
      await this.dumpHtml(`processing_${link.replace(/[^a-zA-Z0-9]/g, '_')}`);
      return null;
    }
  }

  async scrapeLinks(links) {
    try {
      await this.initialize();

      for (const link of links) {
        const result = await this.extractTweetContent(link);
        
        if (result) {
          const { content, tweetTexts } = result;
          const htmlFilename = link.replace(/[^a-zA-Z0-9]/g, '_') + '.html';
          const textFilename = link.replace(/[^a-zA-Z0-9]/g, '_') + '_tweets.txt';
          
          await fs.writeFile(htmlFilename, content);
          await fs.writeFile(textFilename, JSON.stringify(tweetTexts, null, 2));
          
          console.log(`Saved HTML content to ${htmlFilename}`);
          console.log(`Saved tweet texts to ${textFilename}`);
          console.log('Extracted tweets:', tweetTexts);
        }
      }
    } finally {
      await this.close();
    }
  }
}

// Example usage
const main = async () => {
  const twitterLinks = [
    'https://x.com/Hesamation/status/1897667411345580398',
    'https://x.com/kimmonismus/status/1897701427532755340',
  ];

  const scraper = new Scraper(process.env.TWITTER_USERNAME, process.env.TWITTER_PASSWORD);
  try {
    await scraper.scrapeLinks(twitterLinks);
  } catch (error) {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = Scraper;
