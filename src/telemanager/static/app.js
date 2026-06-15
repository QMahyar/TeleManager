const state = {
	accounts: [],
	actionAccountIds: new Set(),
	actionQueue: [],
	activity: [],
	actionPresets: [],
	activeQueueRunId: null,
	queueRunHistory: [],
	dialogFilter: "all",
	dialogs: [],
	pendingAccountId: null,
	selectedDialogTargets: new Set(),
	selectedIds: new Set(),
};

const elements = {
	accountTableWraps: document.querySelectorAll(".account-table-wrap"),
	actionAccountList: document.querySelector("#actionAccountList"),
	actionForm: document.querySelector("#actionForm"),
	actionMessage: document.querySelector("#actionMessage"),
	actionPreview: document.querySelector("#actionPreview"),
	actionQueue: document.querySelector("#actionQueue"),
	actionResults: document.querySelector("#actionResults"),
	actionSelectionCount: document.querySelector("#actionSelectionCount"),
	actionTarget: document.querySelector("#actionTarget"),
	actionType: document.querySelector("#actionType"),
	addQueueStepButton: document.querySelector("#addQueueStepButton"),
	activityLog: document.querySelector("#activityLog"),
	attentionAccounts: document.querySelector("#attentionAccounts"),
	challengeHint: document.querySelector("#challengeHint"),
	challengePanel: document.querySelector("#challengePanel"),
	codeForm: document.querySelector("#codeForm"),
	configForm: document.querySelector("#configForm"),
	clearActionAccounts: document.querySelector("#clearActionAccounts"),
	clearDialogSelectionButton: document.querySelector(
		"#clearDialogSelectionButton",
	),
	clearQueueButton: document.querySelector("#clearQueueButton"),
	configStatus: document.querySelector("#configStatus"),
	dialogAccountSelect: document.querySelector("#dialogAccountSelect"),
	dialogFetchForm: document.querySelector("#dialogFetchForm"),
	dialogFetchStatus: document.querySelector("#dialogFetchStatus"),
	dialogSearch: document.querySelector("#dialogSearch"),
	dialogSelectionCount: document.querySelector("#dialogSelectionCount"),
	dialogsTable: document.querySelector("#dialogsTable"),
	exportSessionsButton: document.querySelector("#exportSessionsButton"),
	knownDialogs: document.querySelector("#knownDialogs"),
	loginForm: document.querySelector("#loginForm"),
	modalCancel: document.querySelector("#modalCancel"),
	modalConfirm: document.querySelector("#modalConfirm"),
	modalDescription: document.querySelector("#modalDescription"),
	modalInput: document.querySelector("#modalInput"),
	modalInputLabel: document.querySelector("#modalInputLabel"),
	modalInputWrap: document.querySelector("#modalInputWrap"),
	modalKicker: document.querySelector("#modalKicker"),
	modalOverlay: document.querySelector("#modalOverlay"),
	modalTitle: document.querySelector("#modalTitle"),
	passwordForm: document.querySelector("#passwordForm"),
	presetList: document.querySelector("#presetList"),
	previewActionButton: document.querySelector("#previewActionButton"),
	queueAccountDelay: document.querySelector("#queueAccountDelay"),
	queueActionDelay: document.querySelector("#queueActionDelay"),
	queueConfirm: document.querySelector("#queueConfirm"),
	queueMaxOperations: document.querySelector("#queueMaxOperations"),
	queueRunHistory: document.querySelector("#queueRunHistory"),
	readyAccounts: document.querySelector("#readyAccounts"),
	refreshRunsButton: document.querySelector("#refreshRunsButton"),
	clearRunsButton: document.querySelector("#clearRunsButton"),
	refreshPresetsButton: document.querySelector("#refreshPresetsButton"),
	selectedCount: document.querySelector("#selectedCount"),
	safetyForm: document.querySelector("#safetyForm"),
	runQueueButton: document.querySelector("#runQueueButton"),
	savePresetButton: document.querySelector("#savePresetButton"),
	selectReadyActionAccounts: document.querySelector(
		"#selectReadyActionAccounts",
	),
	sessionImportForm: document.querySelector("#sessionImportForm"),
	toast: document.querySelector("#toast"),
	totalAccounts: document.querySelector("#totalAccounts"),
	useSelectedDialogsButton: document.querySelector("#useSelectedDialogsButton"),
	viewKicker: document.querySelector("#viewKicker"),
	viewTitle: document.querySelector("#viewTitle"),
};

async function request(path, options = {}) {
	const response = await fetch(path, options);
	const contentType = response.headers.get("content-type") || "";
	const payload = contentType.includes("application/json")
		? await response.json().catch(() => ({}))
		: null;
	if (!response.ok) {
		throw new Error(payload?.detail || "Request failed");
	}
	return payload ?? response;
}

function toForm(values) {
	const body = new FormData();
	Object.entries(values).forEach(([key, value]) => body.set(key, value));
	return body;
}

function showToast(message) {
	elements.toast.textContent = message;
	elements.toast.classList.remove("hidden");
	window.setTimeout(() => elements.toast.classList.add("hidden"), 4200);
}

function closeModal() {
	elements.modalOverlay.classList.add("hidden");
	elements.modalConfirm.onclick = null;
	elements.modalCancel.onclick = null;
	elements.modalInput.onkeydown = null;
}

function askModal({
	title,
	description,
	kicker = "Confirm",
	confirmLabel = "Continue",
	danger = false,
	input = null,
}) {
	elements.modalKicker.textContent = kicker;
	elements.modalTitle.textContent = title;
	elements.modalDescription.textContent = description;
	elements.modalConfirm.textContent = confirmLabel;
	elements.modalConfirm.className = danger ? "button danger" : "button";
	elements.modalInputWrap.classList.toggle("hidden", !input);
	if (input) {
		elements.modalInputLabel.textContent = input.label || "Value";
		elements.modalInput.value = input.value || "";
		elements.modalInput.placeholder = input.placeholder || "";
		elements.modalInput.type = input.type || "text";
	}
	elements.modalOverlay.classList.remove("hidden");
	if (input) elements.modalInput.focus();
	else elements.modalConfirm.focus();
	return new Promise((resolve) => {
		elements.modalCancel.onclick = () => {
			closeModal();
			resolve(null);
		};
		elements.modalConfirm.onclick = () => {
			const value = input ? elements.modalInput.value.trim() : true;
			closeModal();
			resolve(value);
		};
		elements.modalInput.onkeydown = (event) => {
			if (event.key === "Enter") elements.modalConfirm.click();
		};
	});
}

function logActivity(title, detail = "") {
	state.activity.unshift({
		created_at: new Date().toISOString(),
		detail,
		title,
	});
	state.activity = state.activity.slice(0, 50);
	renderActivity(state.activity);
}

function renderActivity(events = state.activity) {
	elements.activityLog.replaceChildren();
	if (!events.length) {
		const empty = document.createElement("p");
		empty.textContent = "Waiting for operator action.";
		elements.activityLog.append(empty);
		return;
	}
	events.forEach((entry) => {
		const item = document.createElement("div");
		item.className = "activity-entry";
		const title = document.createElement("strong");
		title.textContent = entry.title;
		const detail = document.createElement("span");
		const time = entry.created_at
			? new Date(entry.created_at).toLocaleTimeString()
			: "Now";
		detail.textContent = `${time}${entry.detail ? ` · ${entry.detail}` : ""}`;
		item.append(title, detail);
		elements.activityLog.append(item);
	});
}

async function loadActivity() {
	try {
		const payload = await request("/api/activity?limit=100");
		state.activity = payload.events || [];
		renderActivity(state.activity);
	} catch (error) {
		showToast(error.message);
	}
}

async function loadActionPresets() {
	try {
		const payload = await request("/api/actions/presets");
		state.actionPresets = payload.presets || [];
		renderActionPresets();
	} catch (error) {
		showToast(error.message);
	}
}

async function loadSafetySettings() {
	try {
		const payload = await request("/api/settings/safety");
		applySafetySettings(payload.settings);
	} catch (error) {
		showToast(error.message);
	}
}

function applySafetySettings(settings) {
	elements.queueAccountDelay.value = settings.delay_between_accounts;
	elements.queueActionDelay.value = settings.delay_between_actions;
	elements.queueMaxOperations.value = settings.max_operations;
	elements.safetyForm.delay_between_accounts.value =
		settings.delay_between_accounts;
	elements.safetyForm.delay_between_actions.value =
		settings.delay_between_actions;
	elements.safetyForm.max_operations.value = settings.max_operations;
}

async function loadQueueRuns() {
	try {
		const payload = await request("/api/actions/queue/runs?limit=10");
		state.queueRunHistory = payload.runs || [];
		renderQueueRunHistory();
	} catch (error) {
		showToast(error.message);
	}
}

function openView(viewName) {
	document
		.querySelectorAll(".view")
		.forEach((view) => view.classList.remove("active"));
	document
		.querySelectorAll(".nav-item")
		.forEach((item) => item.classList.remove("active"));
	const view = document.querySelector(`#view-${viewName}`);
	const nav = document.querySelector(`[data-nav="${viewName}"]`);
	if (!view) return;
	view.classList.add("active");
	if (nav) nav.classList.add("active");
	elements.viewTitle.textContent = view.dataset.title || "TeleManager";
	elements.viewKicker.textContent = view.dataset.kicker || "Workspace";
	window.location.hash = viewName;
	if (viewName === "activity") loadActivity();
}

function selectedAccountIds() {
	return [...state.selectedIds];
}

function updateSelectedCount() {
	elements.selectedCount.textContent = `${state.selectedIds.size} selected`;
}

function accountStatus(account) {
	if (account.last_error) return "error";
	if (!account.authorized) return "needs login";
	return "ready";
}

function updateMetrics() {
	const ready = state.accounts.filter(
		(account) => account.authorized && !account.last_error,
	).length;
	const attention = state.accounts.filter(
		(account) => !account.authorized || account.last_error,
	).length;
	const dialogs = state.accounts.reduce(
		(total, account) => total + Number(account.dialog_count || 0),
		0,
	);
	elements.totalAccounts.textContent = state.accounts.length;
	elements.readyAccounts.textContent = ready;
	elements.attentionAccounts.textContent = attention;
	elements.knownDialogs.textContent = dialogs;
}

function renderAccountTables() {
	elements.accountTableWraps.forEach((wrap) => {
		wrap.replaceChildren(accountTable());
	});
	updateSelectedCount();
}

function accountTable() {
	const table = document.createElement("table");
	const thead = createTableHead([
		"",
		"Account",
		"Status",
		"Dialogs",
		"Session",
		"Controls",
	]);
	const selectHeader = thead.querySelector("th");
	const selectAllInput = document.createElement("input");
	selectAllInput.type = "checkbox";
	selectAllInput.dataset.selectAll = "";
	selectHeader.replaceChildren(selectAllInput);
	const tbody = document.createElement("tbody");

	if (!state.accounts.length) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.className = "empty";
		cell.colSpan = 6;
		cell.textContent = "No accounts yet.";
		row.append(cell);
		tbody.append(row);
	} else {
		state.accounts.forEach((account) => tbody.append(accountRow(account)));
	}
	table.append(thead, tbody);
	const selectAll = table.querySelector("[data-select-all]");
	selectAll.checked =
		state.accounts.length > 0 &&
		state.accounts.every((account) => state.selectedIds.has(account.id));
	selectAll.addEventListener("change", () => {
		if (selectAll.checked)
			state.accounts.forEach((account) => state.selectedIds.add(account.id));
		else state.selectedIds.clear();
		renderAccountTables();
	});
	return table;
}

function accountRow(account) {
	const row = document.createElement("tr");
	const selectCell = document.createElement("td");
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = state.selectedIds.has(account.id);
	checkbox.addEventListener("change", () => {
		if (checkbox.checked) state.selectedIds.add(account.id);
		else state.selectedIds.delete(account.id);
		updateSelectedCount();
	});
	selectCell.append(checkbox);

	const nameCell = document.createElement("td");
	nameCell.textContent =
		[account.label, account.username ? `@${account.username}` : null]
			.filter(Boolean)
			.join(" · ") || account.session_name;
	if (account.last_error) {
		const error = document.createElement("div");
		error.className = "hint";
		error.textContent = account.last_error;
		nameCell.append(error);
	}

	const statusCell = document.createElement("td");
	const badge = document.createElement("span");
	badge.className = `badge ${accountStatus(account).replace(" ", "_")}`;
	badge.textContent = accountStatus(account);
	statusCell.append(badge);

	const dialogsCell = document.createElement("td");
	dialogsCell.textContent = String(account.dialog_count || 0);

	const sessionCell = document.createElement("td");
	const code = document.createElement("code");
	code.textContent = `${account.session_name}.session`;
	sessionCell.append(code);

	const controlsCell = document.createElement("td");
	const controls = document.createElement("div");
	controls.className = "row-actions";
	controls.append(
		actionButton("Validate", () => validateAccount(account.id), "secondary"),
		actionButton("Dialogs", () => fetchDialogs(account.id), "secondary"),
		actionButton("Rename", () => renameAccountPrompt(account), "secondary"),
		actionButton(
			"Rename File",
			() => renameSessionPrompt(account),
			"secondary",
		),
		actionButton("Delete Local", () => deleteLocalSession(account), "danger"),
		actionButton("Logout", () => logoutAccount(account.id), "danger"),
	);
	controlsCell.append(controls);
	row.append(
		selectCell,
		nameCell,
		statusCell,
		dialogsCell,
		sessionCell,
		controlsCell,
	);
	return row;
}

function actionButton(label, handler, className = "") {
	const button = document.createElement("button");
	button.type = "button";
	button.textContent = label;
	if (className) button.className = className;
	button.addEventListener("click", handler);
	return button;
}

function populateDialogAccountSelect() {
	elements.dialogAccountSelect.replaceChildren();
	state.accounts.forEach((account) => {
		const option = document.createElement("option");
		option.value = account.id;
		option.textContent = account.label || account.session_name;
		elements.dialogAccountSelect.append(option);
	});
}

async function refresh() {
	const [config, accounts] = await Promise.all([
		request("/api/config"),
		request("/api/accounts"),
	]);
	state.accounts = accounts.accounts;
	const knownAccountIds = new Set(state.accounts.map((account) => account.id));
	state.selectedIds = new Set(
		[...state.selectedIds].filter((id) => knownAccountIds.has(id)),
	);
	state.actionAccountIds = new Set(
		[...state.actionAccountIds].filter((id) => knownAccountIds.has(id)),
	);
	elements.configStatus.textContent = config.api_hash_configured
		? `Configured with API ID ${config.api_id}.`
		: "API settings are not configured yet.";
	updateMetrics();
	populateDialogAccountSelect();
	renderAccountTables();
	renderActionAccounts();
	renderActionQueue();
}

async function validateAccount(accountId) {
	try {
		const payload = await request(`/api/accounts/${accountId}/validate`, {
			method: "POST",
		});
		await refresh();
		showToast("Session validated.");
		logActivity("Session validated", payload.account.label);
	} catch (error) {
		await refresh();
		showToast(error.message);
	}
}

async function fetchDialogs(accountId = elements.dialogAccountSelect.value) {
	if (!accountId) return showToast("Choose an account first.");
	try {
		elements.dialogFetchStatus.textContent =
			"Fetching dialogs from Telegram...";
		const limit = Number(
			new FormData(elements.dialogFetchForm).get("limit") || 500,
		);
		const payload = await request(
			`/api/accounts/${accountId}/dialogs/fetch?limit=${limit}`,
			{ method: "POST" },
		);
		state.dialogs = payload.dialogs || [];
		renderDialogs();
		await refresh();
		elements.dialogFetchStatus.textContent = `Fetched ${state.dialogs.length} dialogs at ${payload.fetched_at}.`;
		showToast("Dialogs fetched.");
		logActivity(
			"Dialogs fetched",
			`${payload.account_label} · ${state.dialogs.length}`,
		);
		openView("dialogs");
	} catch (error) {
		elements.dialogFetchStatus.textContent = error.message;
		showToast(error.message);
	}
}

async function loadCachedDialogs(
	accountId = elements.dialogAccountSelect.value,
) {
	if (!accountId) return;
	try {
		const payload = await request(`/api/accounts/${accountId}/dialogs`);
		state.dialogs = payload.dialogs || [];
		elements.dialogFetchStatus.textContent = payload.fetched_at
			? `Cached dialogs from ${payload.fetched_at}.`
			: "No cached dialogs for this account yet.";
		renderDialogs();
	} catch (error) {
		showToast(error.message);
	}
}

function createTableHead(labels) {
	const thead = document.createElement("thead");
	const row = document.createElement("tr");
	labels.forEach((label) => {
		const th = document.createElement("th");
		th.textContent = label;
		row.append(th);
	});
	thead.append(row);
	return thead;
}

function updateDialogSelectionCount() {
	elements.dialogSelectionCount.textContent = `${state.selectedDialogTargets.size} selected`;
}

function renderDialogs() {
	const search = elements.dialogSearch.value.toLowerCase();
	const dialogs = state.dialogs.filter((dialog) => {
		const matchesType =
			state.dialogFilter === "all" ||
			dialog.dialog_type === state.dialogFilter ||
			(state.dialogFilter === "group" &&
				["group", "supergroup"].includes(dialog.dialog_type));
		const text = `${dialog.title || ""} ${dialog.username || ""}`.toLowerCase();
		return matchesType && text.includes(search);
	});
	const table = document.createElement("table");
	const thead = createTableHead([
		"",
		"Name",
		"Type",
		"Username",
		"Unread",
		"Target",
		"Controls",
	]);
	const tbody = document.createElement("tbody");
	if (!dialogs.length) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.className = "empty";
		cell.colSpan = 7;
		cell.textContent = "No dialogs found.";
		row.append(cell);
		tbody.append(row);
	} else {
		dialogs.forEach((dialog) => {
			const row = document.createElement("tr");
			const target = dialog.username
				? `@${dialog.username}`
				: String(dialog.id);
			const selectCell = document.createElement("td");
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = state.selectedDialogTargets.has(target);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) state.selectedDialogTargets.add(target);
				else state.selectedDialogTargets.delete(target);
				updateDialogSelectionCount();
			});
			selectCell.append(checkbox);
			row.append(selectCell);
			[
				dialog.title,
				dialog.dialog_type,
				dialog.username || "",
				String(dialog.unread_count || 0),
				target,
			].forEach((value) => {
				const cell = document.createElement("td");
				cell.textContent = value;
				row.append(cell);
			});
			const controlsCell = document.createElement("td");
			const controls = document.createElement("div");
			controls.className = "row-actions";
			controls.append(
				actionButton("Use Target", () => useDialogTarget(target), "secondary"),
			);
			controlsCell.append(controls);
			row.append(controlsCell);
			tbody.append(row);
		});
	}
	table.append(thead, tbody);
	elements.dialogsTable.replaceChildren(table);
	updateDialogSelectionCount();
}

async function logoutAccount(accountId) {
	const confirmed = await askModal({
		title: "Log out session?",
		description:
			"Telegram will invalidate this local session. You will need to log in again to recreate it.",
		confirmLabel: "Log Out",
		danger: true,
	});
	if (!confirmed) return;
	try {
		const payload = await request("/api/accounts/logout", {
			method: "POST",
			body: toForm({ account_id: accountId }),
		});
		await refresh();
		showToast("Account logged out.");
		logActivity("Account logged out", payload.account.label);
	} catch (error) {
		showToast(error.message);
	}
}

async function renameAccountPrompt(account) {
	const label = await askModal({
		title: "Rename account",
		description:
			"Choose a local display label for this account. Telegram is not changed.",
		confirmLabel: "Save Label",
		input: { label: "Account label", value: account.label },
	});
	if (!label || label === account.label) return;
	try {
		await request(`/api/accounts/${account.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label }),
		});
		await refresh();
		showToast("Account renamed.");
		logActivity("Account renamed", label);
	} catch (error) {
		showToast(error.message);
	}
}

async function renameSessionPrompt(account) {
	const sessionName = await askModal({
		title: "Rename session file",
		description:
			"Use only the filename stem. TeleManager will keep the .session extension.",
		confirmLabel: "Rename File",
		input: {
			label: "Session filename",
			placeholder: "main_account",
			value: account.session_name,
		},
	});
	if (!sessionName || sessionName === account.session_name) return;
	try {
		await request(`/api/sessions/${account.id}/rename-file`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_name: sessionName }),
		});
		await refresh();
		showToast("Session file renamed.");
		logActivity("Session file renamed", sessionName);
	} catch (error) {
		showToast(error.message);
	}
}

async function deleteLocalSession(account) {
	const confirmed = await askModal({
		title: "Delete local session?",
		description: `This removes ${account.label} from TeleManager and deletes the local .session file. Telegram is not logged out.`,
		confirmLabel: "Delete Local",
		danger: true,
	});
	if (!confirmed) return;
	try {
		await request(`/api/accounts/${account.id}`, { method: "DELETE" });
		state.selectedIds.delete(account.id);
		await refresh();
		showToast("Local session deleted.");
		logActivity("Local session deleted", account.label);
	} catch (error) {
		showToast(error.message);
	}
}

function useDialogTarget(target) {
	elements.actionTarget.value = target;
	openView("actions");
	showToast("Dialog target copied into Actions.");
}

function splitTargets(value) {
	return String(value || "")
		.split(/[\n,]+/)
		.map((target) => target.trim())
		.filter(Boolean);
}

function queuePayload(confirm = false) {
	return {
		confirm,
		delay_between_accounts: Number(elements.queueAccountDelay.value || 4),
		delay_between_actions: Number(elements.queueActionDelay.value || 8),
		max_operations: Number(elements.queueMaxOperations.value || 100),
		steps: state.actionQueue.map((step) => ({ ...step })),
	};
}

function renderActionAccounts() {
	elements.actionAccountList.replaceChildren();
	elements.actionSelectionCount.textContent = `${state.actionAccountIds.size} selected`;
	if (!state.accounts.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "Add accounts first.";
		elements.actionAccountList.append(empty);
		return;
	}
	state.accounts.forEach((account) => {
		const row = document.createElement("label");
		row.className = "compact-choice";
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = state.actionAccountIds.has(account.id);
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) state.actionAccountIds.add(account.id);
			else state.actionAccountIds.delete(account.id);
			renderActionAccounts();
		});
		const copy = document.createElement("span");
		const label = document.createElement("strong");
		label.textContent = account.label;
		const status = document.createElement("small");
		status.textContent = accountStatus(account);
		copy.append(label, status);
		row.append(checkbox, copy);
		elements.actionAccountList.append(row);
	});
}

function renderActionPresets() {
	elements.presetList.replaceChildren();
	if (!state.actionPresets.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "No saved presets yet.";
		elements.presetList.append(empty);
		return;
	}
	state.actionPresets.forEach((preset) => {
		const row = document.createElement("div");
		row.className = "preset-row";
		const copy = document.createElement("span");
		const title = document.createElement("strong");
		title.textContent = preset.name;
		const meta = document.createElement("small");
		meta.textContent = `${preset.queue.steps.length} step(s)`;
		copy.append(title, meta);
		const controls = document.createElement("div");
		controls.className = "row-actions";
		controls.append(
			actionButton("Load", () => loadPresetIntoQueue(preset), "secondary"),
			actionButton("Delete", () => deletePreset(preset), "danger"),
		);
		row.append(copy, controls);
		elements.presetList.append(row);
	});
}

function renderQueueRunHistory() {
	elements.queueRunHistory.replaceChildren();
	if (!state.queueRunHistory.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "No queue runs yet.";
		elements.queueRunHistory.append(empty);
		return;
	}
	state.queueRunHistory.forEach((run) => {
		const row = document.createElement("div");
		row.className = "history-row";
		const copy = document.createElement("span");
		const title = document.createElement("strong");
		title.textContent = `${run.status} · ${run.ok_count}/${run.operation_count} ok`;
		const meta = document.createElement("small");
		meta.textContent = new Date(run.created_at).toLocaleString();
		copy.append(title, meta);
		const controls = document.createElement("div");
		controls.className = "row-actions";
		controls.append(
			actionButton("View", () => viewQueueRun(run.id), "secondary"),
			actionButton("Export", () => exportQueueRun(run.id), "secondary"),
			actionButton(
				"Retry Failed",
				() => retryFailedQueueRun(run.id),
				"secondary",
			),
			actionButton("Delete", () => deleteQueueRun(run.id), "danger"),
		);
		row.append(copy, controls);
		elements.queueRunHistory.append(row);
	});
}

async function viewQueueRun(runId) {
	const payload = await request(`/api/actions/queue/runs/${runId}`);
	renderQueueRun(payload.run);
}

function exportQueueRun(runId) {
	window.location.href = `/api/actions/queue/runs/${runId}/export`;
}

async function retryFailedQueueRun(runId) {
	const confirmed = await askModal({
		title: "Retry failed operations?",
		description:
			"This creates a new confirmed queue containing only failed operations from this run.",
		confirmLabel: "Retry Failed",
		danger: true,
	});
	if (!confirmed) return;
	try {
		const response = await request(
			`/api/actions/queue/runs/${runId}/retry-failed`,
			{ method: "POST" },
		);
		showToast("Retry queue started.");
		await pollQueueRun(response.run_id);
	} catch (error) {
		showToast(error.message);
	}
}

async function clearQueueRuns() {
	const confirmed = await askModal({
		title: "Clear queue history?",
		description:
			"This removes all local queue run history. Active runs must finish or be canceled first.",
		confirmLabel: "Clear History",
		danger: true,
	});
	if (!confirmed) return;
	try {
		const payload = await request("/api/actions/queue/runs", {
			method: "DELETE",
		});
		await loadQueueRuns();
		showToast(`Cleared ${payload.removed} queue run(s).`);
	} catch (error) {
		showToast(error.message);
	}
}

async function deleteQueueRun(runId) {
	const confirmed = await askModal({
		title: "Delete queue run?",
		description: "This removes the local history record for this queue run.",
		confirmLabel: "Delete Run",
		danger: true,
	});
	if (!confirmed) return;
	try {
		await request(`/api/actions/queue/runs/${runId}`, { method: "DELETE" });
		await loadQueueRuns();
		showToast("Queue run deleted.");
	} catch (error) {
		showToast(error.message);
	}
}

function renderActionQueue() {
	elements.actionQueue.replaceChildren();
	if (!state.actionQueue.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = "Queue is empty. Add an action step to begin.";
		elements.actionQueue.append(empty);
		return;
	}
	const table = document.createElement("table");
	const thead = createTableHead([
		"Step",
		"Action",
		"Accounts",
		"Targets",
		"Controls",
	]);
	const tbody = document.createElement("tbody");
	state.actionQueue.forEach((step, index) => {
		const row = document.createElement("tr");
		[
			String(index + 1),
			step.action_type,
			String(step.account_ids.length),
			String(step.targets.length),
		].forEach((value) => {
			const cell = document.createElement("td");
			cell.textContent = value;
			row.append(cell);
		});
		const controlsCell = document.createElement("td");
		controlsCell.append(
			actionButton(
				"Remove",
				() => {
					state.actionQueue.splice(index, 1);
					renderActionQueue();
				},
				"danger",
			),
		);
		row.append(controlsCell);
		tbody.append(row);
	});
	table.append(thead, tbody);
	elements.actionQueue.append(table);
}

function renderActionPreview(preview) {
	elements.actionPreview.replaceChildren();
	const card = document.createElement("div");
	card.className = "action-result";
	const title = document.createElement("strong");
	title.textContent = `${preview.operation_count} operation(s) · ${preview.step_count} step(s)`;
	const detail = document.createElement("span");
	detail.textContent = `Estimated ${preview.estimated_seconds}s · Account delay ${preview.delay_between_accounts}s · Action delay ${preview.delay_between_actions}s`;
	card.append(title, detail);
	(preview.warnings || []).forEach((warning) => {
		const warningLine = document.createElement("span");
		warningLine.textContent = warning;
		card.append(warningLine);
	});
	elements.actionPreview.append(card);
}

function renderQueueRun(run) {
	elements.actionPreview.replaceChildren();
	const card = document.createElement("div");
	card.className = "action-result";
	const title = document.createElement("strong");
	title.textContent = `Run ${run.status} · ${run.completed_count}/${run.operation_count}`;
	const detail = document.createElement("span");
	detail.textContent = run.current
		? `Current: ${run.current.account_label} · ${run.current.action_type} · ${run.current.target}`
		: `${run.ok_count} succeeded · ${run.failed_count} failed`;
	card.append(title, detail);
	const progress = document.createElement("div");
	progress.className = "queue-progress";
	const progressFill = document.createElement("span");
	const percent = run.operation_count
		? Math.round((run.completed_count / run.operation_count) * 100)
		: 0;
	progressFill.style.width = `${percent}%`;
	progress.append(progressFill);
	card.append(progress);
	if (run.error) {
		const error = document.createElement("span");
		error.textContent = run.error;
		card.append(error);
	}
	if (["queued", "running", "canceling"].includes(run.status)) {
		const cancelButton = document.createElement("button");
		cancelButton.type = "button";
		cancelButton.className = "button danger queue-cancel-button";
		cancelButton.textContent =
			run.status === "canceling" ? "Cancel Requested" : "Cancel Queue";
		cancelButton.disabled = run.status === "canceling";
		cancelButton.addEventListener("click", () => cancelQueueRun(run.id));
		card.append(cancelButton);
	}
	elements.actionPreview.append(card);
	renderOperationStatuses(run.operations || []);
}

function renderOperationStatuses(operations) {
	elements.actionResults.replaceChildren();
	if (!operations.length) {
		renderActionResults([]);
		return;
	}
	const table = document.createElement("table");
	table.className = "operation-status-table";
	const thead = createTableHead([
		"#",
		"Status",
		"Account",
		"Action",
		"Target",
		"Detail",
	]);
	const tbody = document.createElement("tbody");
	operations.forEach((operation, index) => {
		const row = document.createElement("tr");
		const result = operation.result || {};
		[
			String(index + 1),
			operation.status || "pending",
			operation.account_label,
			operation.action_type,
			operation.target,
			result.detail || "",
		].forEach((value, cellIndex) => {
			const cell = document.createElement("td");
			if (cellIndex === 1) {
				const badge = document.createElement("span");
				badge.className = `status-badge status-${value}`;
				badge.textContent = value;
				cell.append(badge);
			} else {
				cell.textContent = value || "";
			}
			row.append(cell);
		});
		tbody.append(row);
	});
	table.append(thead, tbody);
	elements.actionResults.append(table);
}

async function cancelQueueRun(runId) {
	const confirmed = await askModal({
		title: "Cancel queue run?",
		description:
			"TeleManager will stop before the next queued operation. Any operation already running may finish first.",
		confirmLabel: "Cancel Queue",
		danger: true,
	});
	if (!confirmed) return;
	try {
		const payload = await request(`/api/actions/queue/runs/${runId}/cancel`, {
			method: "POST",
		});
		renderQueueRun(payload.run);
		showToast("Queue cancellation requested.");
	} catch (error) {
		showToast(error.message);
	}
}

async function pollQueueRun(runId) {
	state.activeQueueRunId = runId;
	while (state.activeQueueRunId === runId) {
		const payload = await request(`/api/actions/queue/runs/${runId}`);
		const run = payload.run;
		renderQueueRun(run);
		if (["completed", "failed", "canceled"].includes(run.status)) {
			state.activeQueueRunId = null;
			await refresh();
			loadActivity();
			loadQueueRuns();
			showToast(
				`Queue ${run.status}: ${run.ok_count}/${run.operation_count} succeeded.`,
			);
			return run;
		}
		await new Promise((resolve) => window.setTimeout(resolve, 1200));
	}
	return null;
}

function renderActionResults(results) {
	elements.actionResults.replaceChildren();
	results.forEach((result) => {
		const item = document.createElement("div");
		item.className = `action-result ${result.ok ? "ok" : "fail"}`;
		const title = document.createElement("strong");
		title.textContent = `${result.label} · ${result.action_type} · ${result.ok ? "Success" : "Failed"}`;
		const detail = document.createElement("span");
		detail.textContent = `${result.target || ""} ${result.detail}`.trim();
		item.append(title, detail);
		elements.actionResults.append(item);
	});
}

function loadPresetIntoQueue(preset) {
	state.actionQueue = preset.queue.steps.map((step) => ({ ...step }));
	elements.queueAccountDelay.value = preset.queue.delay_between_accounts || 4;
	elements.queueActionDelay.value = preset.queue.delay_between_actions || 8;
	elements.queueMaxOperations.value = preset.queue.max_operations || 100;
	elements.queueConfirm.checked = false;
	renderActionQueue();
	showToast(`Loaded preset: ${preset.name}`);
}

async function deletePreset(preset) {
	const confirmed = await askModal({
		title: "Delete preset?",
		description: `Delete the saved queue preset "${preset.name}"? This does not affect accounts or dialogs.`,
		confirmLabel: "Delete Preset",
		danger: true,
	});
	if (!confirmed) return;
	try {
		await request(`/api/actions/presets/${preset.id}`, { method: "DELETE" });
		await loadActionPresets();
		showToast("Preset deleted.");
	} catch (error) {
		showToast(error.message);
	}
}

function actionPayload() {
	const data = new FormData(elements.actionForm);
	return {
		action_type: data.get("action_type"),
		account_ids: [...state.actionAccountIds],
		message: String(data.get("message") || ""),
		targets: splitTargets(data.get("target")),
	};
}

elements.addQueueStepButton.addEventListener("click", () => {
	const payload = actionPayload();
	if (!payload.account_ids.length)
		return showToast("Select action accounts first.");
	if (!payload.targets.length) return showToast("Add at least one target.");
	if (payload.action_type === "send_message" && !payload.message.trim())
		return showToast("Message text is required.");
	state.actionQueue.push(payload);
	elements.actionForm.reset();
	renderActionQueue();
	showToast("Action step added to queue.");
});

elements.clearQueueButton.addEventListener("click", () => {
	state.actionQueue = [];
	elements.actionPreview.replaceChildren();
	elements.actionResults.replaceChildren();
	renderActionQueue();
});

elements.savePresetButton.addEventListener("click", async () => {
	if (!state.actionQueue.length)
		return showToast("Add at least one queued step first.");
	const name = await askModal({
		title: "Save queue preset",
		description:
			"Save the current queued steps and delay settings for reuse later.",
		confirmLabel: "Save Preset",
		input: { label: "Preset name", placeholder: "Warmup leave queue" },
	});
	if (!name) return;
	try {
		await request("/api/actions/presets", {
			body: JSON.stringify({ name, queue: queuePayload(false) }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		await loadActionPresets();
		showToast("Preset saved.");
	} catch (error) {
		showToast(error.message);
	}
});

elements.refreshPresetsButton.addEventListener("click", () =>
	loadActionPresets(),
);

elements.refreshRunsButton.addEventListener("click", () => loadQueueRuns());
elements.clearRunsButton.addEventListener("click", () => clearQueueRuns());

elements.previewActionButton.addEventListener("click", async () => {
	if (!state.actionQueue.length)
		return showToast("Add at least one queued step.");
	try {
		const preview = await request("/api/actions/queue/preview", {
			body: JSON.stringify(queuePayload(false)),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		renderActionPreview(preview);
		showToast("Queue preview ready.");
	} catch (error) {
		showToast(error.message);
	}
});

elements.actionType.addEventListener("change", () => {
	const requiresMessage = elements.actionType.value === "send_message";
	elements.actionMessage.required = requiresMessage;
	elements.actionMessage.placeholder = requiresMessage
		? "Message that selected sessions will send"
		: "Required only for Send message";
});

elements.actionForm.addEventListener("submit", (event) => {
	event.preventDefault();
	elements.addQueueStepButton.click();
});

elements.runQueueButton.addEventListener("click", async () => {
	if (!state.actionQueue.length)
		return showToast("Add at least one queued step.");
	if (state.activeQueueRunId) return showToast("A queue is already running.");
	if (!elements.queueConfirm.checked)
		return showToast("Confirm the queue before running it.");
	try {
		const response = await request("/api/actions/queue/run", {
			body: JSON.stringify(queuePayload(true)),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		showToast("Queue started. Progress will update here.");
		await pollQueueRun(response.run_id);
	} catch (error) {
		state.activeQueueRunId = null;
		await refresh();
		showToast(error.message);
	}
});

elements.selectReadyActionAccounts.addEventListener("click", () => {
	state.actionAccountIds = new Set(
		state.accounts
			.filter((account) => account.authorized && !account.last_error)
			.map((account) => account.id),
	);
	renderActionAccounts();
});

elements.clearActionAccounts.addEventListener("click", () => {
	state.actionAccountIds.clear();
	renderActionAccounts();
});

elements.useSelectedDialogsButton.addEventListener("click", () => {
	if (!state.selectedDialogTargets.size)
		return showToast("Select one or more dialogs first.");
	elements.actionTarget.value = [...state.selectedDialogTargets].join("\n");
	openView("actions");
	showToast("Selected dialogs copied into Actions.");
});

elements.clearDialogSelectionButton.addEventListener("click", () => {
	state.selectedDialogTargets.clear();
	renderDialogs();
});

elements.configForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		await request("/api/config", {
			method: "POST",
			body: new FormData(elements.configForm),
		});
		elements.configForm.reset();
		await refresh();
		showToast("API settings saved locally.");
		logActivity("API settings saved", "Credentials updated locally");
	} catch (error) {
		showToast(error.message);
	}
});

elements.safetyForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const data = new FormData(elements.safetyForm);
	try {
		const payload = await request("/api/settings/safety", {
			body: JSON.stringify({
				delay_between_accounts: Number(data.get("delay_between_accounts")),
				delay_between_actions: Number(data.get("delay_between_actions")),
				max_operations: Number(data.get("max_operations")),
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		applySafetySettings(payload.settings);
		showToast("Safety defaults saved.");
	} catch (error) {
		showToast(error.message);
	}
});

elements.loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		const payload = await request("/api/accounts/login", {
			method: "POST",
			body: new FormData(elements.loginForm),
		});
		state.pendingAccountId = payload.account.id;
		elements.challengePanel.classList.remove("hidden");
		elements.passwordForm.classList.add("hidden");
		elements.challengeHint.textContent = `Enter the login code for ${payload.account.phone}.`;
		await refresh();
		showToast("Login code requested.");
		logActivity("Login code requested", payload.account.label);
	} catch (error) {
		showToast(error.message);
	}
});

elements.codeForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!state.pendingAccountId) return;
	try {
		const body = new FormData(elements.codeForm);
		body.set("account_id", state.pendingAccountId);
		const payload = await request("/api/accounts/confirm-code", {
			method: "POST",
			body,
		});
		if (payload.account.status === "password_pending") {
			elements.passwordForm.classList.remove("hidden");
			elements.challengeHint.textContent =
				"This account has Telegram 2FA enabled. Enter the password to finish login.";
		} else {
			elements.challengePanel.classList.add("hidden");
			state.pendingAccountId = null;
			showToast("Account login complete.");
			logActivity("Account login complete", "Saved ready session");
		}
		elements.codeForm.reset();
		await refresh();
	} catch (error) {
		showToast(error.message);
	}
});

elements.passwordForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!state.pendingAccountId) return;
	try {
		const body = new FormData(elements.passwordForm);
		body.set("account_id", state.pendingAccountId);
		await request("/api/accounts/confirm-password", { method: "POST", body });
		elements.challengePanel.classList.add("hidden");
		elements.passwordForm.reset();
		state.pendingAccountId = null;
		await refresh();
		showToast("Account login complete.");
		logActivity("Account login complete", "Saved ready session");
	} catch (error) {
		showToast(error.message);
	}
});

elements.dialogFetchForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	await fetchDialogs(elements.dialogAccountSelect.value);
});

elements.dialogAccountSelect.addEventListener("change", () =>
	loadCachedDialogs(),
);
elements.dialogSearch.addEventListener("input", renderDialogs);
document.querySelectorAll("[data-dialog-filter]").forEach((button) => {
	button.addEventListener("click", () => {
		document
			.querySelectorAll("[data-dialog-filter]")
			.forEach((item) => item.classList.remove("active"));
		button.classList.add("active");
		state.dialogFilter = button.dataset.dialogFilter;
		renderDialogs();
	});
});

elements.sessionImportForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		const payload = await request("/api/sessions/import-file", {
			method: "POST",
			body: new FormData(elements.sessionImportForm),
		});
		elements.sessionImportForm.reset();
		await refresh();
		showToast("Session imported.");
		logActivity("Session imported", payload.account.label);
	} catch (error) {
		showToast(error.message);
	}
});

elements.exportSessionsButton.addEventListener("click", async () => {
	const ids = selectedAccountIds();
	if (!ids.length) return showToast("Select at least one session.");
	const confirmed = await askModal({
		title: "Export session credentials?",
		description:
			"Exported session files can access Telegram accounts. Keep the ZIP private and do not upload it anywhere.",
		confirmLabel: "Export ZIP",
		danger: true,
	});
	if (!confirmed) return;
	try {
		const response = await fetch("/api/sessions/export", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ account_ids: ids, redact_phone: true }),
		});
		if (!response.ok)
			throw new Error((await response.json()).detail || "Export failed");
		const blob = await response.blob();
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "telemanager-sessions.zip";
		link.click();
		URL.revokeObjectURL(url);
		showToast("Session export created.");
		logActivity("Sessions exported", `${ids.length} session(s)`);
	} catch (error) {
		showToast(error.message);
	}
});

document
	.querySelectorAll("[data-nav]")
	.forEach((item) =>
		item.addEventListener("click", () => openView(item.dataset.nav)),
	);
document
	.querySelectorAll("[data-open-view]")
	.forEach((item) =>
		item.addEventListener("click", () => openView(item.dataset.openView)),
	);
elements.refreshButton = document.querySelector("#refreshButton");
elements.refreshButton.addEventListener("click", () =>
	refresh().catch((error) => showToast(error.message)),
);

document.querySelectorAll("[data-reveal]").forEach((element, index) => {
	element.style.setProperty("--reveal-delay", `${index * 60}ms`);
	element.classList.add("revealed");
});

renderActivity();
loadActivity();
loadActionPresets();
loadQueueRuns();
loadSafetySettings();
openView((window.location.hash || "#command").slice(1) || "command");
refresh().catch((error) => showToast(error.message));
