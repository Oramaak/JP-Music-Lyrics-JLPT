const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

var lyrics;

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static('public'));

const URL = 'https://duckduckgo.com/?t=h_&q=';

app.post('/api/query', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const browser = await puppeteer.launch({
        // headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(0); // Disable timeout for all operations
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        console.log(`Searching for: ${query} site:lyrical-nonsense.com`);
        await page.goto(URL + encodeURIComponent(query) + encodeURIComponent(' site:lyrical-nonsense.com'), {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        await page.waitForSelector('ol li article, .result__body, [data-testid="result"]'); // Wait for main results to load

        // Wait a bit for dynamic content to load
        // await new Promise(resolve => setTimeout(resolve, 1500));

        // Debug: save page content
        // const fs = require('fs');
        // fs.writeFileSync('duck.html', await page.content());
        console.log('Page loaded, extracting search results...');

        const results = await page.evaluate(() => {
            const links = [];

            // Try multiple strategies to find search results

            // Strategy 1: Look for all list items in the main results section
            const resultItems = document.querySelectorAll('ol li article, .result__body, [data-testid="result"]');

            for (const item of resultItems) {
                try {
                    // Try to find title and link within each result item
                    let titleElement = item.querySelector('h2 a span, h3 a span, .result__title a span, a[data-testid="result-title-a"] span');
                    let linkElement = item.querySelector('h2 a, h3 a, .result__title a, a[data-testid="result-title-a"]');

                    // Fallback: if no span, try getting text directly from link
                    if (!titleElement && linkElement) {
                        titleElement = linkElement;
                    }

                    if (titleElement && linkElement) {
                        const title = titleElement.textContent.trim();
                        const href = linkElement.getAttribute('href');

                        // Only include results from lyrical-nonsense.com
                        if (title && href && href.includes('lyrical-nonsense.com')) {
                            links.push({
                                title: title,
                                url: href
                            });
                        }
                    }
                } catch (itemError) {
                    console.log('Error processing item:', itemError);
                }
            }

            // Strategy 2: If no results found, try the original XPath approach but for multiple items
            if (links.length === 0) {
                const baseXPath = '/html/body/div[2]/div[6]/div[4]/div/div/div/div[2]/section[1]/ol/li';

                // Try to get all li elements (li[1], li[2], li[3], etc.)
                for (let i = 1; i <= 10; i++) { // Check first 10 results
                    try {
                        const titleElement = document.evaluate(
                            `${baseXPath}[${i}]/article/div[3]/h2/a/span`,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        ).singleNodeValue;

                        const linkElement = document.evaluate(
                            `${baseXPath}[${i}]/article/div[3]/h2/a`,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        ).singleNodeValue;

                        if (titleElement && linkElement) {
                            const title = titleElement.textContent.trim();
                            const href = linkElement.getAttribute('href');

                            if (title && href && href.includes('lyrical-nonsense.com')) {
                                links.push({
                                    title: title,
                                    url: href
                                });
                            }
                        }
                    } catch (xpathError) {
                        // Continue to next item if this one fails
                        continue;
                    }
                }
            }

            // Strategy 3: Generic fallback - look for any links containing lyrical-nonsense.com
            if (links.length === 0) {
                const allLinks = document.querySelectorAll('a[href*="lyrical-nonsense.com"]');

                for (const link of allLinks) {
                    const title = link.textContent.trim() || link.getAttribute('title') || 'Unknown Title';
                    const href = link.getAttribute('href');

                    if (title && href && title.length > 5) { // Avoid very short titles
                        links.push({
                            title: title,
                            url: href
                        });
                    }
                }
            }

            // Remove duplicates and limit results
            const uniqueLinks = [];
            const seenUrls = new Set();

            for (const link of links) {
                if (!seenUrls.has(link.url) && uniqueLinks.length < 10) {
                    seenUrls.add(link.url);
                    uniqueLinks.push(link);
                }
            }

            return uniqueLinks;
        });

        console.log(`Found ${results.length} results for query: ${query}`);
        // console.log('Results:', results);

        title = results.map(result => result.title).join(', ');
        // console.log('Titles:', title);

        res.json({ result: title, songID: results.map(result => result.url) });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    } finally {
        await browser.close();
    }
});

app.post('/api/song', async (req, res) => {
    const { song } = req.body;
    console.log('Received request to /api/song with song:', song);

    if (!song) {
        return res.status(400).json({ error: 'Song parameter is required' });
    }

    res.setTimeout(300000); // 5 minutes timeout

    const browser = await puppeteer.launch({
        // headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(0); // Disable timeout for all operations
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        console.log(`Fetching song lyrics for: ${song}`);
        await page.goto(song, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait a bit for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Debug: save page content
        // const fs = require('fs');
        // fs.writeFileSync('song.html', await page.content());
        console.log('Song page loaded, extracting lyrics...');

        page.on('console', async (msg) => {
            const msgArgs = msg.args();
            for (let i = 0; i < msgArgs.length; ++i) {
                console.log(await msgArgs[i].jsonValue());
            }
        });

        lyrics = await page.evaluate(() => {
            // Strategy 1: Look for lyrics in spans with class "line-text" under div with id "Original"
            const originalDiv = document.getElementById('Original');
            if (originalDiv) {
                // console.log('Found Original div, extracting lyrics from it');
                const lineTextSpans = originalDiv.querySelectorAll('span.line-text');

                if (lineTextSpans.length > 0) {
                    // console.log(`Found ${lineTextSpans.length} line-text spans in Original div`);
                    const lyricsLines = [];
                    lineTextSpans.forEach(span => {
                        let text = span.textContent.trim();
                        // console.log('Extracting line:', text);
                        if (text) {
                            lyricsLines.push(text);
                        }
                    });

                    if (lyricsLines.length > 0) {
                        console.log(`Extracted ${lyricsLines.length} lines of lyrics from Original div`);
                        return lyricsLines.join('\n');
                    }
                }
            }

            // Strategy 2: Fallback - look for any spans with class "line-text"
            const allLineTextSpans = document.querySelectorAll('span.line-text');
            if (allLineTextSpans.length > 0) {
                console.log(`Found ${allLineTextSpans.length} line-text spans in the document`);
                const lyricsLines = [];
                allLineTextSpans.forEach(span => {
                    const text = span.textContent.trim();
                    if (text) {
                        console.log('Adding line from fallback method:', text);
                        lyricsLines.push(text);
                    }
                });

                if (lyricsLines.length > 0) {
                    console.log(`Extracted ${lyricsLines.length} lines of lyrics from fallback method`);
                    return lyricsLines.join('\n');
                }
            }

            // Strategy 3: Look for common lyrics containers
            const lyricsContainers = document.querySelectorAll('.lyrics, .lyrics-container, #lyrics, [class*="lyric"]');
            for (const container of lyricsContainers) {
                console.log('Checking alternative lyrics container:', container.className);
                const text = container.textContent.trim();
                if (text && text.length > 50) { // Assume lyrics should be at least 50 characters
                    console.log('Found lyrics in alternative container');
                    return text;
                }
            }

            console.log('No lyrics found with any strategy');
            return '';
        });

        console.log('Lyrics extracted successfully:', lyrics ? `${lyrics.length} characters` : 'No lyrics found');
        console.log('Lyrics content:', lyrics);

        if (!lyrics || lyrics.length < 10) {
            return res.status(404).json({ error: 'No lyrics found on this page' });
        }

        res.json({ lyrics });
    } catch (error) {
        console.error('Error fetching song lyrics:', error);
        res.status(500).json({ error: 'Failed to fetch song lyrics' });
    } finally {
        await browser.close();
    }
});

app.get('/api/annotations', async (req, res) => {
    // Set headers for Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const browser = await puppeteer.launch({
        // headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    page.on('console', async (msg) => {
        const msgArgs = msg.args();
        for (let i = 0; i < msgArgs.length; ++i) {
            console.log(await msgArgs[i].jsonValue());
        }
    });

    try {
        const lyricsLines = lyrics.split('\n').filter(line => line.trim().length > 0);
        const totalLines = lyricsLines.length;
        
        // Send initial status
        res.write(`data: ${JSON.stringify({
            type: 'status',
            message: `Starting annotation processing for ${totalLines} lines...`,
            progress: 0,
            total: totalLines
        })}\n\n`);
        
        for (let i = 0; i < lyricsLines.length; i++) {
            const line = lyricsLines[i];
            
            try {
                console.log(`Fetching annotations for line: ${line}`);
                
                // Send progress update
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    message: `Processing line ${i + 1}/${totalLines}: "${line.substring(0, 30)}${line.length > 30 ? '...' : ''}"`,
                    progress: i,
                    total: totalLines,
                    currentLine: line
                })}\n\n`);
                
                // Use Puppeteer to navigate to Jisho.org and scrape JLPT data
                await page.goto(`https://jisho.org/search/${encodeURIComponent(line)}`, {
                    waitUntil: 'networkidle0',
                    timeout: 30000
                });
                
                const annotations = await page.evaluate(() => {
                    // id="zen_bar" -> span class="japanese_word__text_wrapper" -> href -> goto -> span class="concept_light-tag label" -> get JLPT level
                    const annotationsList = [];
                    
                    // Find the zen_bar element
                    const zenBar = document.getElementById('zen_bar');
                    if (zenBar) {
                        // Find all japanese word text wrappers within zen_bar
                        const wordWrappers = zenBar.querySelectorAll('span.japanese_word__text_wrapper');
                        
                        wordWrappers.forEach(wrapper => {
                            // Check if this wrapper is inside a particle (li with data-pos="Particle")
                            const parentLi = wrapper.closest('li[data-pos]');
                            if (parentLi && parentLi.getAttribute('data-pos') === 'Particle') {
                                console.log('Skipping particle:', wrapper.textContent.trim());
                                return; // Skip particles
                            }
                            
                            // Find the href link within the wrapper
                            const link = wrapper.querySelector('a[href]');
                            if (link) {
                                const word = wrapper.textContent.trim();
                                const href = link.getAttribute('href');
                                
                                annotationsList.push({
                                    word: word,
                                    detailUrl: href
                                });
                            }
                        });
                    }

                    return annotationsList;
                });
                
                console.log('Annotations fetched successfully:', annotations);
                
                // Special case: if line might be just a single word, check for JLPT level directly on search page
                let directJLPTLevel = null;
                const trimmedLine = line.trim();
                
                // Check if this might be a single word (no spaces, short length, or only one annotation found)
                if (annotations.length <= 1 && trimmedLine.length <= 10) {
                    directJLPTLevel = await page.evaluate(() => {
                        // Helper function to convert WaniKani level to JLPT
                        function wanikaniToJLPT(wanikaniLevel) {
                            if (wanikaniLevel < 7) return 'N5';
                            if (wanikaniLevel < 13) return 'N4';
                            if (wanikaniLevel < 31) return 'N3';
                            if (wanikaniLevel < 45) return 'N2';
                            if (wanikaniLevel <= 60) return 'N1';
                            return 'unknown';
                        }
                        
                        // Look for JLPT level directly on the search page
                        const labels = document.querySelectorAll('span.concept_light-tag.label');
                        for (const label of labels) {
                            const text = label.textContent.trim();
                            
                            // Check for direct JLPT level first
                            if (text.includes('JLPT')) {
                                return text;
                            }
                            
                            // Check for WaniKani level and convert to JLPT
                            if (text.includes('wanikani level')) {
                                const match = text.match(/wanikani level\s*(\d+)/i);
                                if (match) {
                                    const wanikaniLevel = parseInt(match[1]);
                                    const jlptEquivalent = wanikaniToJLPT(wanikaniLevel);
                                    return `JLPT ${jlptEquivalent} (WaniKani Level ${wanikaniLevel})`;
                                }
                            }
                        }
                        return null;
                    });
                    
                    console.log('Direct JLPT level found on search page:', directJLPTLevel);
                }
                
                // If we found JLPT level directly and it's a single word, use that
                if (directJLPTLevel && annotations.length <= 1) {
                    const processedAnnotations = [{
                        word: trimmedLine,
                        jlptLevel: directJLPTLevel
                    }];
                    
                    // Send line completion update
                    res.write(`data: ${JSON.stringify({
                        type: 'line-complete',
                        lineIndex: i,
                        line: line,
                        annotations: processedAnnotations,
                        progress: i + 1,
                        total: totalLines
                    })}\n\n`);
                    
                    continue; // Skip the parallel processing for this line
                }
                
                // Process all words in parallel for much faster scraping
                const detailedAnnotations = await Promise.allSettled(
                    annotations.map(async (annotation, wordIndex) => {
                        if (!annotation.detailUrl) return null;
                        
                        // Create a new page for each word to enable parallel processing
                        const wordPage = await browser.newPage();
                        wordPage.setDefaultTimeout(0);
                        await wordPage.setViewport({ width: 1920, height: 1080 });
                        
                        try {
                            console.log(`[Parallel] Visiting detail page for word: ${annotation.word}`);
                            
                            // Send word processing update
                            res.write(`data: ${JSON.stringify({
                                type: 'word-processing',
                                message: `Looking up JLPT level for: ${annotation.word} (${wordIndex + 1}/${annotations.length})`,
                                word: annotation.word,
                                lineIndex: i
                            })}\n\n`);
                            
                            await wordPage.goto(`https://jisho.org${annotation.detailUrl}`, {
                                waitUntil: 'networkidle0',
                                timeout: 30000
                            });
                            
                            const jlptLevel = await wordPage.evaluate(() => {
                                // Helper function to convert WaniKani level to JLPT
                                function wanikaniToJLPT(wanikaniLevel) {
                                    if (wanikaniLevel < 7) return 'N5';
                                    if (wanikaniLevel < 13) return 'N4';
                                    if (wanikaniLevel < 31) return 'N3';
                                    if (wanikaniLevel < 45) return 'N2';
                                    if (wanikaniLevel <= 60) return 'N1';
                                    return 'unknown';
                                }
                                
                                // Look for JLPT level in concept_light-tag label spans
                                const labels = document.querySelectorAll('span.concept_light-tag.label');
                                for (const label of labels) {
                                    const text = label.textContent.trim();
                                    
                                    // Check for direct JLPT level first
                                    if (text.includes('JLPT')) {
                                        return text;
                                    }
                                    
                                    // Check for WaniKani level and convert to JLPT
                                    if (text.includes('Wanikani level')) {
                                        const match = text.match(/Wanikani level\s*(\d+)/i);
                                        if (match) {
                                            const wanikaniLevel = parseInt(match[1]);
                                            const jlptEquivalent = wanikaniToJLPT(wanikaniLevel);
                                            return `JLPT ${jlptEquivalent} (WaniKani Level ${wanikaniLevel})`;
                                        }
                                    }
                                }
                                return null;
                            });
                            
                            console.log(`[Parallel] JLPT level for ${annotation.word}: ${jlptLevel}`);
                            
                            return {
                                word: annotation.word,
                                jlptLevel: jlptLevel
                            };
                            
                        } catch (error) {
                            console.error(`[Parallel] Error fetching JLPT level for ${annotation.word}:`, error);
                            return {
                                word: annotation.word,
                                jlptLevel: null
                            };
                        } finally {
                            await wordPage.close();
                        }
                    })
                );
                
                // Filter successful results and handle failures
                const processedAnnotations = detailedAnnotations
                    .map(result => result.status === 'fulfilled' ? result.value : null)
                    .filter(annotation => annotation !== null);
                
                // Send line completion update
                res.write(`data: ${JSON.stringify({
                    type: 'line-complete',
                    lineIndex: i,
                    line: line,
                    annotations: processedAnnotations,
                    progress: i + 1,
                    total: totalLines
                })}\n\n`);
                
            } catch (error) {
                console.error('Error fetching annotations for line:', line, error);
                
                // Send error update
                res.write(`data: ${JSON.stringify({
                    type: 'line-error',
                    lineIndex: i,
                    line: line,
                    error: error.message,
                    progress: i + 1,
                    total: totalLines
                })}\n\n`);
            }
        }
        
        // Send completion message
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            message: 'All annotations processed successfully!',
            progress: totalLines,
            total: totalLines
        })}\n\n`);
        
    } catch (error) {
        console.error('Error fetching annotations:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Failed to fetch annotations',
            error: error.message
        })}\n\n`);
    } finally {
        await browser.close();
        res.end();
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});