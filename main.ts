import { App, Editor, getLinkpath, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, TFile, iterateRefs } from 'obsidian';
import openai from 'openai';

// Remember to rename these classes and interfaces!

interface SummarizerPluginSettings {
	mySetting: string;
	openaiApiKey: string;
	anthropicApiKey: string;
	deepseekApiKey: string;
	llmProvider: string;
	llmModelId: string;
}

const DEFAULT_SETTINGS: SummarizerPluginSettings = {
	mySetting: 'default',
	openaiApiKey: '',
	anthropicApiKey: '',
	deepseekApiKey: '',
	llmProvider: 'openai',
	llmModelId: 'gpt-4o'
}

export default class SummarizerPlugin extends Plugin {
	settings: SummarizerPluginSettings;
	apiCaller: ApiCaller;

	async onload() {
		await this.loadSettings();

		this.apiCaller = new ApiCaller(this.settings);

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Summarizer Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-summarizer-modal-simple',
			name: 'Open summarizer modal (simple)',
			callback: () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				new SummarizerModal(this.app, this.apiCaller, activeView, false).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'summarizer-editor-command',
			name: 'Summarizer editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Summarizer Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'summarize-current-note-modal',
			name: 'Summarize Current Note',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SummarizerModal(this.app, this.apiCaller, markdownView, false).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});
		
		// Add a command to summarize the current note with all linked content
		this.addCommand({
			id: 'summarize-current-note-with-links-modal',
			name: 'Summarize Current Note with Links',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						new SummarizerModal(this.app, this.apiCaller, markdownView, true).open();
					}
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SummarizerSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ApiCaller {
	private apiKey: string;
	private llmModelId: string;
	private provider: string;
	constructor(settings: SummarizerPluginSettings) {
		this.provider = settings.llmProvider;
		if (this.provider === 'openai') {
			this.apiKey = settings.openaiApiKey;
		} else if (this.provider === 'anthropic') {
			this.apiKey = settings.anthropicApiKey;
		} else if (this.provider === 'deepseek') {
			this.apiKey = settings.deepseekApiKey;
		}
		this.llmModelId = settings.llmModelId;
	}

	createClient() {
		const provider = this.provider;
		const model = this.llmModelId;
		let baseUrl: string;

		switch (provider) {
			case 'openai':
				baseUrl = 'https://api.openai.com/v1';
				break;
			case 'anthropic':
				baseUrl = 'https://api.anthropic.com/v1';
				break;
			case 'deepseek':
				baseUrl = 'https://api.deepseek.com/v1';
				break;
			default:
				throw new Error(`Unsupported provider: ${provider}`);
		}

		return this.createOpenAIClient(model, baseUrl);
	}

	private createOpenAIClient(model: string, baseUrl: string) {
		// Assuming OpenAI client initialization
		return new openai.OpenAI({ 
			apiKey: this.apiKey, 
			baseURL: baseUrl, 
			dangerouslyAllowBrowser: true,
		});
	}

	chatCompletion(messages: any[]) {
		const client = this.createClient();
		return client.chat.completions.create({
			model: this.llmModelId,
			messages: messages
		});
	}
}

class SummarizerModal extends Modal {
	apiCaller: ApiCaller;
	markdownView: MarkdownView | null;
	summarizeWithLinks: boolean;

	constructor(app: App, apiCaller: ApiCaller, markdownView: MarkdownView | null, summarizeWithLinks: boolean = false) {
		super(app);
		this.apiCaller = apiCaller;
		this.markdownView = markdownView;
		this.summarizeWithLinks = summarizeWithLinks;
	}

	async onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		
		// Create loading indicator
		const loadingEl = contentEl.createDiv('loading-container');
		loadingEl.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">Generating summary...</div>';
		
		// Add some basic styling for the spinner
		loadingEl.createEl('style', {
			text: `
				.loading-container { text-align: center; margin-top: 20px; }
				.loading-spinner { 
					border: 5px solid #f3f3f3;
					border-top: 5px solid #888;
					border-radius: 50%;
					width: 30px;
					height: 30px;
					animation: spin 1s linear infinite;
					margin: 0 auto 10px;
				}
				@keyframes spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}
				.loading-text { font-size: 14px; color: #888; }
			`
		});
		
		try {
			let content = this.markdownView?.getViewData() || "";
			let additionalContent = "";
			
			// If we need to summarize with links, get linked content
			if (this.summarizeWithLinks && this.markdownView?.file) {
				const linkedContents = await this.getLinkedContents(this.markdownView.file);
				additionalContent = linkedContents;
			}
			
			if (false) { // TODO: Remove this test line
			// if (this.apiCaller) {
				try {
					const promptContent = this.summarizeWithLinks 
						? `Please briefly summarize the following text and its linked content:\n\nMain Content:\n${content}\n\nLinked Content:\n${additionalContent}`
						: `Please briefly summarize the following text:\n\n${content}`;
						
					const messages = [
						{ role: "system", content: "You are a helpful assistant that briefly summarizes text." },
						{ role: "user", content: promptContent }
					];
					
					const response = await this.apiCaller.chatCompletion(messages);
					contentEl.empty();
					contentEl.createEl('h3', { text: this.summarizeWithLinks ? 'Summary (with linked content)' : 'Summary' });
					contentEl.createEl('p', { text: response.choices[0].message.content || 'No summary available' });
				} catch (error) {
					contentEl.empty();
					contentEl.createEl('p', { text: `Error getting summary: ${error.message}` });
					contentEl.createEl('pre', { text: content });
				}
			} else {
				contentEl.setText(`No API caller available. Raw content:\n\n${content}`);
			}
		} catch (error) {
			contentEl.empty();
			contentEl.createEl('p', { text: `Error processing content: ${error.message}` });
		}
	}
	
	async resolveLinkedFile(link: any, vault: any): Promise<TFile | null> {
		const linkText = link.link;
		
		// First, try direct path resolution
		const linkedFile = vault.getAbstractFileByPath(linkText);
		if (linkedFile instanceof TFile) {
			return linkedFile;
		}
		
		// If direct path fails, try finding by name or alias
		const files = vault.getMarkdownFiles();
		for (const file of files) {
			// Check filename without extension
			const fileName = file.basename;
			if (fileName === linkText) {
				console.log("fileName: ", fileName, linkText);
				return file;
			}
			
			// Check for aliases (if applicable)
			const metadataCache = this.app.metadataCache;
			const fileCache = metadataCache.getFileCache(file);
			if (fileCache?.frontmatter?.aliases) {
				const aliases = Array.isArray(fileCache.frontmatter.aliases) ? fileCache.frontmatter.aliases : [fileCache.frontmatter.aliases];
				for (const alias of aliases) {
					if (alias === linkText) {
						return file;
					}
				}
			}
		}
		
		return null;
	}

	async getLinkedContents(file: TFile | null): Promise<string> {
		const linkedContents: string[] = [];
		
		// If no file provided, return empty string
		if (!file) return "";
		
		// Get the file's metadata to extract internal links
		const metadataCache = this.app.metadataCache;
		const vault = this.app.vault;
		const fileCache = metadataCache.getFileCache(file);
		
		// Get file content for URL extraction
		const fileContent = await vault.cachedRead(file);
		
		// Process internal links from metadata cache
		if (fileCache?.links) {
			for (const link of fileCache.links) {
				console.log("link: ", link);
				try {
					// Internal Obsidian link
					const linkedFile = await this.resolveLinkedFile(link, vault);
					console.log("linkedFile: ", linkedFile);
					if (linkedFile) {
						const content = await vault.cachedRead(linkedFile);
						console.log("Content: ", content);
						linkedContents.push(`Internal Link (${link.link}):\n${content}\n\n`);
					}
				} catch (error) {
					console.error(`Error processing internal link ${link.link}:`, error);
				}
			}
		}
		
		// // Extract and process external URLs directly from file content
		// function extractUrls(text: string): string[] {
		// 	const urlRegex = /(https?:\/\/[^\s]+)/g;
		// 	const urls = text.match(urlRegex) || [];
		// 	return urls;
		// }
		
		// const urls = extractUrls(fileContent);
		// for (const url of urls) {
		// 	console.log("url: ", url);
		// 	try {
		// 		const response = await requestUrl({ url });
		// 		// Basic stripping of HTML tags for simple text extraction
		// 		const textContent = response.text.replace(/<[^>]*>/g, ' ').substring(0, 5000); // Limit to 5000 chars
		// 		linkedContents.push(`URL Link (${url}):\n${textContent}\n\n`);
		// 		console.log("textContent: ", textContent);
		// 	} catch (error) {
		// 		linkedContents.push(`URL Link (${url}): Error fetching content - ${error.message}\n\n`);
		// 	}
		// }
		
		return linkedContents.join('');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SummarizerSettingTab extends PluginSettingTab {
	plugin: SummarizerPlugin;

	constructor(app: App, plugin: SummarizerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Enter your OpenAI API key')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Anthropic API Key')
			.setDesc('Enter your Anthropic API key')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.anthropicApiKey)
				.onChange(async (value) => {
					this.plugin.settings.anthropicApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('DeepSeek API Key')
			.setDesc('Enter your DeepSeek API key')
			.addText(text => text
				.setPlaceholder('Enter your DeepSeek API key')
				.setValue(this.plugin.settings.deepseekApiKey)
				.onChange(async (value) => {
					this.plugin.settings.deepseekApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('LLM Provider')
			.setDesc('Enter the LLM provider (deepseek, openai, anthropic)')
			.addText(text => text
				.setPlaceholder('e.g., openai')
				.setValue(this.plugin.settings.llmProvider)
				.onChange(async (value) => {
					this.plugin.settings.llmProvider = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('LLM Model ID')
			.setDesc('Enter the LLM model ID')
			.addText(text => text
				.setPlaceholder('e.g., gpt-4o')
				.setValue(this.plugin.settings.llmModelId)
				.onChange(async (value) => {
					this.plugin.settings.llmModelId = value;
					await this.plugin.saveSettings();
				}));
	}
}

