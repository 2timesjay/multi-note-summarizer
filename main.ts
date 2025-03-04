import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import openai from 'openai';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	openaiApiKey: string;
	anthropicApiKey: string;
	deepseekApiKey: string;
	llmProvider: string;
	llmModelId: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	openaiApiKey: '',
	anthropicApiKey: '',
	deepseekApiKey: '',
	llmProvider: 'openai',
	llmModelId: 'gpt-4o'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	apiCaller: ApiCaller;

	async onload() {
		await this.loadSettings();

		this.apiCaller = new ApiCaller(this.settings);

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
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
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app, markdownView).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

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
	constructor(settings: MyPluginSettings) {
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
		const [provider, model] = this.llmModelId.split('/');
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
		return new openai.OpenAI({ apiKey: this.apiKey, baseURL: baseUrl });
	}

	chatCompletion(messages: any[]) {
		const client = this.createClient();
		return client.chat.completions.create({
			model: this.llmModelId,
			messages: messages
		});
	}
}



class SampleModal extends Modal {
	markdownView: MarkdownView;

	constructor(app: App, markdownView: MarkdownView) {
		super(app);
		this.markdownView = markdownView;
	}

	onOpen() {
		const {contentEl} = this;
		console.log(this.markdownView);
		contentEl.setText(this.markdownView.getViewData());
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
