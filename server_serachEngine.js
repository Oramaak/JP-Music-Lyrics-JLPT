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
    console.log('Received request to /api/query with body:', req.body);
    const { query } = req.body;
    const website = req.body.website || 'https://www.lyrical-nonsense.com/';
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(0); // Disable timeout for all operations
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        console.log(`Searching for: ${query} site:${website}`);
        await page.goto(URL + encodeURIComponent(query) + encodeURIComponent(' site:' + website), {
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

        const results = await page.evaluate((targetWebsite) => {
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

                        // Include results from the target website
                        if (title && href && href.includes(targetWebsite)) {
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

                            if (title && href && href.includes(targetWebsite)) {
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

            // Strategy 3: Generic fallback - look for any links containing the target website
            if (links.length === 0) {
                const allLinks = document.querySelectorAll(`a[href*="${targetWebsite}"]`);

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
        }, website);

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

        if (song.includes('lyrical-nonsense.com')) {
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
        } else if (song.includes('utaten.com')) {
            // Utaten.com extraction
            lyrics = await page.evaluate(() => {
                // Strategy 1: XPath to get the hiragana div
                let container = null;
                try {
                    const xpathResult = document.evaluate(
                        '//*[@id="contents"]/main/article/div[6]/div/div[1]',
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    );
                    container = xpathResult.singleNodeValue;
                } catch (e) { /* ignore */ }

                // Strategy 2: CSS selector if XPath fails
                if (!container) {
                    container = document.querySelector('#contents > main > article > div.lyricBody.lyricBody > div > div.hiragana');
                }

                // Strategy 3: Look for any .hiragana div
                if (!container) {
                    container = document.querySelector('div.hiragana');
                }

                if (!container) return '';

                // Get the full HTML content and convert ruby markup
                let html = container.innerHTML.trim();
                
                // Convert <span class="ruby"><span class="rb">砂浜</span><span class="rt">すなはま</span></span> 
                // to <ruby><rb>砂浜</rb><rt>すなはま</rt></ruby>
                html = html.replace(/<span class=(?:"|')ruby(?:"|')>\s*<span class=(?:"|')rb(?:"|')>(.*?)<\/span>\s*<span class=(?:"|')rt(?:"|')>(.*?)<\/span>\s*<\/span>/g, 
                    '<ruby><rb>$1</rb><rt>$2</rt></ruby>');

                // Clean up any extra whitespace but preserve line breaks
                html = html.replace(/\s+/g, ' ').replace(/<br>\s*/g, '<br>').trim();

                return html;
            });
        }

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
        // First, mark double <br> as verse separators and replace single <br> with \n
        const processedLyrics = lyrics.replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n___VERSE_SEPARATOR___\n') // Mark double <br> as verse separator
            .replace(/<br\s*\/?>/g, '\n'); // Replace single <br> with \n
        
        // Split into lines and process
        const lyricsLines = processedLyrics.split('\n').map(line => {
            if (line.trim() === '___VERSE_SEPARATOR___') {
                return '___VERSE_SEPARATOR___'; // Keep verse separator marker
            }
            return line.trim();
        }).filter(line => line !== ''); // Remove only truly empty lines

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

            // Check if this is a verse separator
            if (line === '___VERSE_SEPARATOR___') {
                // Send verse separator update
                res.write(`data: ${JSON.stringify({
                    type: 'line-complete',
                    lineIndex: i,
                    line: '', // Convert back to double <br> for display
                    annotations: [],
                    progress: i + 1,
                    total: totalLines
                })}\n\n`);
                continue;
            }

            try {
                // Extract plain text from HTML for search purposes
                // For ruby text, extract only the base text (rb) not the furigana (rt)
                let searchText = line;
                
                // First, extract text from <ruby><rb>base</rb><rt>furigana</rt></ruby> - keep only 'base'
                searchText = searchText.replace(/<ruby><rb>(.*?)<\/rb><rt>.*?<\/rt><\/ruby>/g, '$1');
                
                // Then remove any remaining HTML tags
                searchText = searchText.replace(/<[^>]*>/g, '').trim();
                
                // Create a mapping of original positions to help with styling later
                const originalLine = line;
                const textSegments = [];
                let currentPos = 0;
                
                // Parse the line to identify ruby and non-ruby segments
                const rubyRegex = /<ruby><rb>(.*?)<\/rb><rt>(.*?)<\/rt><\/ruby>/g;
                let lastIndex = 0;
                let match;
                
                while ((match = rubyRegex.exec(originalLine)) !== null) {
                    // Add any text before this ruby
                    if (match.index > lastIndex) {
                        const beforeText = originalLine.substring(lastIndex, match.index).replace(/<[^>]*>/g, '');
                        if (beforeText.trim()) {
                            textSegments.push({
                                type: 'normal',
                                text: beforeText.trim(),
                                originalHtml: originalLine.substring(lastIndex, match.index)
                            });
                        }
                    }
                    
                    // Add the ruby segment
                    textSegments.push({
                        type: 'ruby',
                        text: match[1], // base text only
                        originalHtml: match[0],
                        baseText: match[1],
                        furigana: match[2]
                    });
                    
                    lastIndex = rubyRegex.lastIndex;
                }
                
                // Add any remaining text after the last ruby
                if (lastIndex < originalLine.length) {
                    const remainingText = originalLine.substring(lastIndex).replace(/<[^>]*>/g, '');
                    if (remainingText.trim()) {
                        textSegments.push({
                            type: 'normal',
                            text: remainingText.trim(),
                            originalHtml: originalLine.substring(lastIndex)
                        });
                    }
                }
                
                console.log(`Fetching annotations for line: ${searchText} (original: ${line})`);

                // Send progress update
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    message: `Processing line ${i + 1}/${totalLines}: "${searchText.substring(0, 30)}${searchText.length > 30 ? '...' : ''}"`,
                    progress: i,
                    total: totalLines,
                    currentLine: line
                })}\n\n`);

                // Use Puppeteer to navigate to Jisho.org and scrape JLPT data using plain text
                await page.goto(`https://jisho.org/search/${encodeURIComponent(searchText)}`, {
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

                // Try to match annotations with text segments for better accuracy
                const enhancedAnnotations = [];
                const usedAnnotations = new Set();
                
                // First, try to find matches by combining segments and partial segments
                for (let start = 0; start < textSegments.length; start++) {
                    for (let length = Math.min(4, textSegments.length - start); length >= 1; length--) {
                        // Try full segment combination first
                        const combinedText = textSegments.slice(start, start + length).map(s => s.text).join('');
                        let matchingAnnotation = annotations.find(ann => ann.word === combinedText && !usedAnnotations.has(ann.word));
                        
                        if (matchingAnnotation) {
                            enhancedAnnotations.push({
                                word: combinedText,
                                detailUrl: matchingAnnotation.detailUrl,
                                segmentType: length === 1 ? textSegments[start].type : 'combined',
                                segmentRange: { start, length, partialEnd: null }
                            });
                            usedAnnotations.add(matchingAnnotation.word);
                            start += length - 1;
                            break;
                        }
                        
                        // If no full match, try partial matches (word starts with combined segments but extends into next segment)
                        if (length < textSegments.length - start) {
                            matchingAnnotation = annotations.find(ann => 
                                ann.word.startsWith(combinedText) && 
                                ann.word.length > combinedText.length &&
                                !usedAnnotations.has(ann.word)
                            );
                            
                            if (matchingAnnotation) {
                                const remainingText = matchingAnnotation.word.substring(combinedText.length);
                                const nextSegment = textSegments[start + length];
                                
                                // Check if the remaining text matches the beginning of the next segment
                                if (nextSegment && nextSegment.text.startsWith(remainingText)) {
                                    enhancedAnnotations.push({
                                        word: matchingAnnotation.word,
                                        detailUrl: matchingAnnotation.detailUrl,
                                        segmentType: 'partial_combined',
                                        segmentRange: { 
                                            start, 
                                            length: length + 1,
                                            partialEnd: remainingText.length // How much of the last segment to use
                                        }
                                    });
                                    usedAnnotations.add(matchingAnnotation.word);
                                    start += length; // Skip the full segments, but not the partial one
                                    break;
                                }
                            }
                        }
                    }
                }

                // Add any remaining annotations that didn't match with segments
                annotations.forEach(annotation => {
                    if (!usedAnnotations.has(annotation.word)) {
                        enhancedAnnotations.push({
                            word: annotation.word,
                            detailUrl: annotation.detailUrl,
                            segmentType: 'unmatched'
                        });
                    }
                });

                // Use enhanced annotations
                const finalAnnotations = enhancedAnnotations;

                console.log('Enhanced annotations:', finalAnnotations);

                // Special case: if line might be just a single word, check for JLPT level directly on search page
                let directJLPTLevel = null;
                const trimmedSearchText = searchText.trim();

                // Check if this might be a single word (no spaces, short length, or only one annotation found)
                if (finalAnnotations.length <= 1 && trimmedSearchText.length <= 10) {
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
                if (directJLPTLevel && finalAnnotations.length <= 1) {
                    const processedAnnotations = [{
                        word: trimmedSearchText,
                        jlptLevel: directJLPTLevel
                    }];

                    // Send line completion update with segment information
                    res.write(`data: ${JSON.stringify({
                        type: 'line-complete',
                        lineIndex: i,
                        line: line,
                        annotations: processedAnnotations,
                        textSegments: textSegments, // Add segment information for better styling
                        progress: i + 1,
                        total: totalLines
                    })}\n\n`);

                    continue; // Skip the parallel processing for this line
                }

                // Process all words in parallel for much faster scraping
                const detailedAnnotations = await Promise.allSettled(
                    finalAnnotations.map(async (annotation, wordIndex) => {
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
                                message: `Looking up JLPT level for: ${annotation.word} (${wordIndex + 1}/${finalAnnotations.length})`,
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

                // Send line completion update with segment information
                res.write(`data: ${JSON.stringify({
                    type: 'line-complete',
                    lineIndex: i,
                    line: line,
                    annotations: processedAnnotations,
                    textSegments: textSegments, // Add segment information for better styling
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