import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
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
				new SummarizerModal(this.app, this.apiCaller, null).open();
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
						new SummarizerModal(this.app, this.apiCaller, markdownView).open();
					}

					// This command will only show up in Command Palette when the check function returns true
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
	markdownView: MarkdownView;

	constructor(app: App, apiCaller: ApiCaller,markdownView: MarkdownView) {
		super(app);
		this.apiCaller = apiCaller;
		this.markdownView = markdownView;
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
		
		const content = this.markdownView.getViewData();
		
		if (this.apiCaller) {
			try {
				const messages = [
					{ role: "system", content: "You are a helpful assistant that briefly summarizes text." },
					{ role: "user", content: `Please briefly summarize the following text:\n\n${content}` }
				];
				
				const response = await this.apiCaller.chatCompletion(messages);
				contentEl.empty();
				contentEl.createEl('h3', { text: 'Summary' });
				contentEl.createEl('p', { text: response.choices[0].message.content || 'No summary available' });
			} catch (error) {
				contentEl.empty();
				contentEl.createEl('p', { text: `Error getting summary: ${error.message}` });
				contentEl.createEl('pre', { text: content });
			}
		} else {
			contentEl.setText(`No API caller available. Raw content:\n\n${content}`);
		}
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

