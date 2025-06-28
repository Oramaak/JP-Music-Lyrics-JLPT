
async function submitQuery() {
	const inputValue = document.getElementById("inputText").value;
	const resultDiv = document.getElementById("result");
	const lyricsDiv = document.getElementById("lyrics_head");
	const lyricsContentDiv = document.getElementById("lyrics_content");
	const lyricsAnnotationsDiv = document.getElementById("lyrics_annotations");
	const lyricsHeadDiv = document.getElementById("lyrics_head");
	const fontSizeControl = document.getElementById("fontSizeControl");
	const alignmentSelect = document.getElementById("alignment");

	resultDiv.innerHTML = "Loading...";
	lyricsDiv.innerHTML = ""; // Clear previous lyrics
	lyricsContentDiv.innerHTML = ""; // Clear previous content
	lyricsAnnotationsDiv.innerHTML = ""; // Clear previous annotations
	lyricsHeadDiv.innerHTML = ""; // Clear previous head
	fontSizeControl.style.display = "none"; // Hide font size control initially
	alignmentSelect.style.display = "none"; // Hide alignment select initially

	try {
		const response = await fetch("/api/query", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: inputValue }),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();

		if (data.error) {
			throw new Error(data.error);
		}

		// Ensure data.result is treated as a string
		const result = String(data.result || "");
		console.log("Query result:", result);
		const songID = data.songID || [];
		const items = result.split(",");

		let listHTML = '<ul class="result-list">';
		items.forEach((item, index) => {
			const trimmedItem = item.trim();
			listHTML += `<li class="result-item" data-value="${encodeURIComponent(
				trimmedItem
			)}" data-id="${songID[index]}">${trimmedItem}</li>`;
		});
		listHTML += "</ul>";

		resultDiv.innerHTML = listHTML;

		// Add event listeners to the list items
		document.querySelectorAll(".result-item").forEach((item) => {
			item.addEventListener("click", async () => {
				const selectedValue = decodeURIComponent(item.getAttribute("data-id"));
				item.classList.add("selected");
				lyricsHeadDiv.innerHTML = `Loading...`;
				lyricsContentDiv.innerHTML = `Loading lyrics...`;
				lyricsAnnotationsDiv.innerHTML = `Waiting for lyrics...`;

				try {
					const songResponse = await fetch("/api/song", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ song: selectedValue }),
					});

					if (!songResponse.ok) {
						throw new Error(`HTTP error! status: ${songResponse.status}`);
					}

					// Handle the song response if needed
					const songData = await songResponse.json();

					displayLyrics(songData, item);
					displayAnnotationsLyrics();
				} catch (err) {
					console.error("Song fetch error:", err);
					resultDiv.innerHTML += `<p>Error fetching song: ${err.message}</p>`;
				}
			});
		});
	} catch (error) {
		console.error("Fetch error:", error);
		resultDiv.innerHTML = `<p>Error: ${error.message}</p>`;
	}
}

function displayLyrics(songData, item) {
	const lyricsDiv = document.getElementById("lyrics_content");
	const lyricsHeadDiv = document.getElementById("lyrics_head");
	const fontSizeControl = document.getElementById("fontSizeControl");
	const lyricsAnnotationsDiv = document.getElementById("lyrics_annotations");
	const alignmentSelect = document.getElementById("alignment");

	if (songData.error) {
		throw new Error(songData.error);
	}

	// Show the font size control when lyrics are displayed
	fontSizeControl.style.display = "block";

	const lyrics = songData.lyrics;
	console.log("Lyrics:", lyrics);
	const songTitle = item.textContent || "Unknown Song";

	lyricsHeadDiv.innerHTML = `
	<h3>${songTitle}</h3>
	`;
	lyricsDiv.innerHTML = `<br><br><div style="padding: 0 2px;">${lyrics}</div>`;
	lyricsAnnotationsDiv.innerHTML = `Loading annotations...`;
	alignmentSelect.style.display = "block"; // Show alignment select when lyrics are displayed
}

async function displayAnnotationsLyrics() {
	const lyricsAnnotationsDiv = document.getElementById("lyrics_annotations");

	// Initialize the annotations display - just the color-coded text
	lyricsAnnotationsDiv.innerHTML = `
		<div id="color-coded-lyrics" style="white-space: pre-wrap; line-height: 1.8;"></div>
	`;

	// Add processing status and summary section at the bottom
	const statusDiv = document.createElement('div');
	statusDiv.id = 'status-container';
	statusDiv.innerHTML = `
		<div id="processing-status-section" style="margin-top: 30px; padding: 15px; background-color: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">
			<div id="processing-status" style="font-style: italic; color: #1565C0; text-align: center;">Starting analysis...</div>
		</div>
		<div id="summary-section" style="display: none; margin-top: 15px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
			<h4>JLPT Analysis Summary</h4>
			<div id="jlpt-summary"></div>
		</div>
	`;
	document.body.appendChild(statusDiv);

	try {
		// Create EventSource for Server-Sent Events
		const eventSource = new EventSource('/api/annotations');

		const processingStatus = document.getElementById('processing-status');
		const colorCodedLyrics = document.getElementById('color-coded-lyrics');
		const summarySection = document.getElementById('summary-section');
		const jlptSummary = document.getElementById('jlpt-summary');

		const allAnnotations = [];
		const lyricsLines = [];

		eventSource.onmessage = function (event) {
			try {
				const data = JSON.parse(event.data);

				switch (data.type) {
					case 'status':
						processingStatus.textContent = data.message;
						break;

					case 'progress':
						processingStatus.textContent = `Processing line ${data.progress + 1}/${data.total}: "${data.currentLine.substring(0, 40)}${data.currentLine.length > 40 ? '...' : ''}"`;
						break;

					case 'word-processing':
						processingStatus.textContent = `Looking up: ${data.word}`;
						break;

					case 'line-complete':
						// Add the completed line to our annotations
						allAnnotations[data.lineIndex] = {
							line: data.line,
							annotations: data.annotations
						};

						// Create color-coded version of this line
						const colorCodedLine = createColorCodedLine(data.line, data.annotations);
						lyricsLines[data.lineIndex] = colorCodedLine;

						// Update the display with all processed lines so far
						updateColorCodedDisplay(lyricsLines, colorCodedLyrics);

						processingStatus.textContent = `Completed line ${data.progress}/${data.total}`;
						break;

					case 'line-error':
						// Add the error line to our annotations
						allAnnotations[data.lineIndex] = {
							line: data.line,
							annotations: [],
							error: data.error
						};

						// Add uncolored line for errors
						lyricsLines[data.lineIndex] = data.line;
						updateColorCodedDisplay(lyricsLines, colorCodedLyrics);

						processingStatus.textContent = `Processed line ${data.progress}/${data.total} (with error)`;
						break;

					case 'complete':
						document.getElementById('processing-status-section').style.display = 'none'; // Hide processing status section when complete

						// Show summary
						showSummary(allAnnotations, summarySection, jlptSummary);
						eventSource.close();
						break;

					case 'error':
						processingStatus.textContent = `Error: ${data.message}`;
						eventSource.close();
						break;
				}
			} catch (parseError) {
				console.error('Error parsing SSE data:', parseError);
			}
		};

		eventSource.onerror = function (error) {
			console.error('EventSource failed:', error);
			processingStatus.textContent = 'Connection error - analysis may be incomplete';
			eventSource.close();
		};

	} catch (error) {
		console.error("Error setting up annotations stream:", error);
		lyricsAnnotationsDiv.innerHTML = `<p>Error setting up annotations: ${error.message}</p>`;
	}
}

function createColorCodedLine(line, annotations) {
	if (!annotations || annotations.length === 0) {
		return line; // Return original line if no annotations
	}

	let colorCodedLine = line;

	// Sort annotations by word length (longest first) to avoid partial replacements
	const sortedAnnotations = [...annotations].sort((a, b) => b.word.length - a.word.length);

	sortedAnnotations.forEach(annotation => {
		const levelColor = getLevelColor(annotation.jlptLevel);
		const coloredWord = `<span style="background-color: ${levelColor}; color: white; padding: 1px 2px; border-radius: 2px;" title="${annotation.jlptLevel || 'Unknown'}">${annotation.word}</span>`;

		// Replace the word in the line (case sensitive)
		colorCodedLine = colorCodedLine.replace(new RegExp(escapeRegex(annotation.word), 'g'), coloredWord);
	});

	return colorCodedLine;
}

function updateColorCodedDisplay(lyricsLines, container) {
	// Filter out undefined/null lines and join them
	const displayText = lyricsLines
		.map(line => line || '') // Replace undefined with empty string
		.join('\n');

	container.innerHTML = displayText;
}

function escapeRegex(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showSummary(allAnnotations, summarySection, jlptSummary) {
	// Count JLPT levels
	const levelCounts = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, Unknown: 0 };
	const uniqueWords = new Set();
	let totalLines = 0;
	let linesWithData = 0;

	allAnnotations.forEach(annotation => {
		if (annotation) {
			totalLines++;
			if (annotation.annotations && annotation.annotations.length > 0) {
				linesWithData++;
				annotation.annotations.forEach(word => {
					uniqueWords.add(word.word);
					if (word.jlptLevel) {
						if (word.jlptLevel.includes('N5')) levelCounts.N5++;
						else if (word.jlptLevel.includes('N4')) levelCounts.N4++;
						else if (word.jlptLevel.includes('N3')) levelCounts.N3++;
						else if (word.jlptLevel.includes('N2')) levelCounts.N2++;
						else if (word.jlptLevel.includes('N1')) levelCounts.N1++;
						else levelCounts.Unknown++;
					} else {
						levelCounts.Unknown++;
					}
				});
			}
		}
	});

	// Determine overall difficulty
	const totalWords = Object.values(levelCounts).reduce((a, b) => a + b, 0);
	let difficulty = 'Unknown';
	if (totalWords > 0) {
		const hardWords = levelCounts.N1 + levelCounts.N2;
		const easyWords = levelCounts.N5 + levelCounts.N4;

		if (hardWords > totalWords * 0.3) difficulty = 'Advanced (N1-N2)';
		else if (levelCounts.N3 > totalWords * 0.3) difficulty = 'Intermediate (N3)';
		else if (easyWords > totalWords * 0.5) difficulty = 'Beginner (N4-N5)';
		else difficulty = 'Mixed Levels';
	}

	jlptSummary.innerHTML = `
		<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 10px 0;">
			<div style="background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">
				<strong>Overall Difficulty:</strong> ${difficulty}<br>
				<strong>Lines Processed:</strong> ${totalLines}<br>
				<strong>Lines with JLPT Data:</strong> ${linesWithData}<br>
				<strong>Unique Words Found:</strong> ${uniqueWords.size}
			</div>
			<div style="background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">
				<strong>JLPT Level Breakdown:</strong><br>
				<span style="color: #4CAF50;">N5: ${levelCounts.N5}</span> | 
				<span style="color: #8BC34A;">N4: ${levelCounts.N4}</span> | 
				<span style="color: #FFC107;">N3: ${levelCounts.N3}</span><br>
				<span style="color: #FF9800;">N2: ${levelCounts.N2}</span> | 
				<span style="color: #F44336;">N1: ${levelCounts.N1}</span> | 
				<span style="color: #9E9E9E;">Unknown: ${levelCounts.Unknown}</span>
			</div>
		</div>
	`;

	summarySection.style.display = 'block';
}

function getLevelColor(jlptLevel) {
	if (!jlptLevel) return '#9E9E9E';

	if (jlptLevel.includes('N5')) return '#4CAF50';
	if (jlptLevel.includes('N4')) return '#8BC34A';
	if (jlptLevel.includes('N3')) return '#FFC107';
	if (jlptLevel.includes('N2')) return '#FF9800';
	if (jlptLevel.includes('N1')) return '#F44336';

	return '#9E9E9E';
}

function toggleAlignment() {
	const lyricsDiv = document.getElementById("lyrics_content");
	const lyricsAnnotationsDiv = document.getElementById("lyrics_annotations");

	if (lyricsDiv.style.textAlign === "center") {
		lyricsDiv.style.textAlign = "left";
		lyricsAnnotationsDiv.style.textAlign = "left";
	} else {
		lyricsDiv.style.textAlign = "center";
		lyricsAnnotationsDiv.style.textAlign = "center";
	}
}

function adjustFontSize(size) {
	const lyricsDiv = document.getElementById("lyrics_content");
	const lyricsAnnotationsDiv = document.getElementById("lyrics_annotations");
	const fontSizeDisplay = document.getElementById("fontSizeDisplay");

	lyricsDiv.style.fontSize = size + "px";
	lyricsAnnotationsDiv.style.fontSize = size + "px";
	fontSizeDisplay.textContent = size + "px";
}
