const state = {
	accounts: [],
	activity: [],
	pendingAccountId: null,
};

const elements = {
	accountsBody: document.querySelector("#accountsBody"),
	activityLog: document.querySelector("#activityLog"),
	challengeHint: document.querySelector("#challengeHint"),
	challengePanel: document.querySelector("#challengePanel"),
	codeForm: document.querySelector("#codeForm"),
	configForm: document.querySelector("#configForm"),
	configStatus: document.querySelector("#configStatus"),
	loginForm: document.querySelector("#loginForm"),
	passwordForm: document.querySelector("#passwordForm"),
	runningAccounts: document.querySelector("#runningAccounts"),
	selectAll: document.querySelector("#selectAll"),
	selectedCount: document.querySelector("#selectedCount"),
	stoppedAccounts: document.querySelector("#stoppedAccounts"),
	toast: document.querySelector("#toast"),
	totalAccounts: document.querySelector("#totalAccounts"),
};

async function request(path, options = {}) {
	const response = await fetch(path, options);
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload.detail || "Request failed");
	}
	return payload;
}

function formData(form) {
	return new FormData(form);
}

function showToast(message) {
	elements.toast.textContent = message;
	elements.toast.classList.remove("hidden");
	window.setTimeout(() => elements.toast.classList.add("hidden"), 4200);
}

function logActivity(title, detail = "") {
	state.activity.unshift({ detail, time: new Date(), title });
	state.activity = state.activity.slice(0, 8);
	renderActivity();
}

function renderActivity() {
	elements.activityLog.replaceChildren();
	if (!state.activity.length) {
		const empty = document.createElement("p");
		empty.textContent = "Waiting for operator action.";
		elements.activityLog.append(empty);
		return;
	}

	state.activity.forEach((entry) => {
		const item = document.createElement("div");
		item.className = "activity-entry";
		const title = document.createElement("strong");
		title.textContent = entry.title;
		const detail = document.createElement("span");
		detail.textContent = `${entry.time.toLocaleTimeString()}${entry.detail ? ` · ${entry.detail}` : ""}`;
		item.append(title, detail);
		elements.activityLog.append(item);
	});
}

function selectedAccountIds() {
	return [...document.querySelectorAll("input[data-account-id]:checked")].map(
		(input) => input.dataset.accountId,
	);
}

function updateSelectedCount() {
	const selected = selectedAccountIds().length;
	elements.selectedCount.textContent = `${selected} selected`;
}

function updateMetrics() {
	const running = state.accounts.filter(
		(account) => account.status === "running",
	).length;
	const stopped = state.accounts.filter(
		(account) => account.status === "stopped",
	).length;
	elements.totalAccounts.textContent = state.accounts.length;
	elements.runningAccounts.textContent = running;
	elements.stoppedAccounts.textContent = stopped;
}

function renderAccounts() {
	elements.accountsBody.replaceChildren();

	if (!state.accounts.length) {
		const row = document.createElement("tr");
		const cell = document.createElement("td");
		cell.className = "empty";
		cell.colSpan = 6;
		cell.textContent = "No accounts yet.";
		row.append(cell);
		elements.accountsBody.append(row);
		return;
	}

	state.accounts.forEach((account) => {
		const row = document.createElement("tr");
		const displayName = [
			account.label,
			account.username ? `@${account.username}` : null,
		]
			.filter(Boolean)
			.join(" · ");

		const selectCell = document.createElement("td");
		const checkbox = document.createElement("input");
		checkbox.dataset.accountId = account.id;
		checkbox.type = "checkbox";
		checkbox.addEventListener("change", updateSelectedCount);
		selectCell.append(checkbox);

		const nameCell = document.createElement("td");
		nameCell.textContent = displayName || account.phone;
		if (account.last_error) {
			const error = document.createElement("div");
			error.className = "hint";
			error.textContent = account.last_error;
			nameCell.append(error);
		}

		const phoneCell = document.createElement("td");
		phoneCell.textContent = account.phone;

		const statusCell = document.createElement("td");
		const status = document.createElement("span");
		status.className = `badge ${account.status}`;
		status.textContent = account.status.replace("_", " ");
		statusCell.append(status);

		const sessionCell = document.createElement("td");
		const sessionName = document.createElement("code");
		sessionName.textContent = `${account.session_name}.session`;
		sessionCell.append(sessionName);

		const controlsCell = document.createElement("td");
		controlsCell.append(accountControls(account.id));

		row.append(
			selectCell,
			nameCell,
			phoneCell,
			statusCell,
			sessionCell,
			controlsCell,
		);
		elements.accountsBody.append(row);
	});
}

function accountControls(accountId) {
	const controls = document.createElement("div");
	controls.className = "row-actions";
	controls.append(
		actionButton("Start", () => startAccount(accountId)),
		actionButton("Stop", () => stopAccount(accountId), "secondary"),
		actionButton("Logout", () => logoutAccount(accountId), "danger"),
	);
	return controls;
}

function actionButton(label, handler, className = "") {
	const button = document.createElement("button");
	button.type = "button";
	button.textContent = label;
	if (className) button.className = className;
	button.addEventListener("click", handler);
	return button;
}

async function refresh() {
	const [config, accounts] = await Promise.all([
		request("/api/config"),
		request("/api/accounts"),
	]);
	state.accounts = accounts.accounts;
	elements.configStatus.textContent = config.api_hash_configured
		? `Configured with API ID ${config.api_id}.`
		: "API settings are not configured yet.";
	updateMetrics();
	renderAccounts();
	updateSelectedCount();
}

async function startAccount(accountId) {
	try {
		await request("/api/accounts/start", {
			method: "POST",
			body: toForm({ account_id: accountId }),
		});
		await refresh();
		showToast("Account started.");
		logActivity("Account started", "Session connected");
	} catch (error) {
		await refresh();
		showToast(error.message);
	}
}

async function stopAccount(accountId) {
	try {
		await request("/api/accounts/stop", {
			method: "POST",
			body: toForm({ account_id: accountId }),
		});
		await refresh();
		showToast("Account stopped.");
		logActivity("Account stopped", "Session disconnected");
	} catch (error) {
		await refresh();
		showToast(error.message);
	}
}

async function logoutAccount(accountId) {
	if (
		!window.confirm(
			"Log out this Telegram session? You will need to log in again to recreate it.",
		)
	) {
		return;
	}
	await request("/api/accounts/logout", {
		method: "POST",
		body: toForm({ account_id: accountId }),
	});
	await refresh();
	showToast("Account logged out.");
	logActivity("Account logged out", "Session revoked");
}

function toForm(values) {
	const body = new FormData();
	Object.entries(values).forEach(([key, value]) => body.set(key, value));
	return body;
}

elements.configForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		await request("/api/config", {
			method: "POST",
			body: formData(elements.configForm),
		});
		elements.configForm.reset();
		await refresh();
		showToast("API settings saved locally.");
		logActivity("API settings saved", "Credentials updated locally");
	} catch (error) {
		showToast(error.message);
	}
});

elements.loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	try {
		const payload = await request("/api/accounts/login", {
			method: "POST",
			body: formData(elements.loginForm),
		});
		state.pendingAccountId = payload.account.id;
		elements.challengePanel.classList.remove("hidden");
		elements.passwordForm.classList.add("hidden");
		elements.challengeHint.textContent = `Enter the login code for ${payload.account.phone}.`;
		await refresh();
		showToast("Login code requested.");
		logActivity("Login code requested", payload.account.phone);
	} catch (error) {
		showToast(error.message);
	}
});

elements.codeForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!state.pendingAccountId) return;
	try {
		const body = formData(elements.codeForm);
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
			logActivity("Account login complete", "Saved stopped session");
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
		const body = formData(elements.passwordForm);
		body.set("account_id", state.pendingAccountId);
		await request("/api/accounts/confirm-password", { method: "POST", body });
		elements.challengePanel.classList.add("hidden");
		elements.passwordForm.reset();
		state.pendingAccountId = null;
		await refresh();
		showToast("Account login complete.");
		logActivity("Account login complete", "Saved stopped session");
	} catch (error) {
		showToast(error.message);
	}
});

document
	.querySelector("#refreshButton")
	.addEventListener("click", () =>
		refresh().catch((error) => showToast(error.message)),
	);

document
	.querySelector("#startSelectedButton")
	.addEventListener("click", async () => {
		const ids = selectedAccountIds();
		if (!ids.length) return showToast("Select at least one account.");
		try {
			await request("/api/accounts/start-selected", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(ids),
			});
			await refresh();
			showToast("Selected accounts started.");
			logActivity("Selected accounts started", `${ids.length} account(s)`);
		} catch (error) {
			await refresh();
			showToast(error.message);
		}
	});

document
	.querySelector("#stopSelectedButton")
	.addEventListener("click", async () => {
		const ids = selectedAccountIds();
		if (!ids.length) return showToast("Select at least one account.");
		try {
			await request("/api/accounts/stop-selected", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(ids),
			});
			await refresh();
			showToast("Selected accounts stopped.");
			logActivity("Selected accounts stopped", `${ids.length} account(s)`);
		} catch (error) {
			await refresh();
			showToast(error.message);
		}
	});

document
	.querySelector("#startAllButton")
	.addEventListener("click", async () => {
		try {
			await request("/api/accounts/start-all", { method: "POST" });
			await refresh();
			showToast("All accounts started.");
			logActivity(
				"All accounts started",
				`${state.accounts.length} account(s)`,
			);
		} catch (error) {
			await refresh();
			showToast(error.message);
		}
	});

document.querySelector("#stopAllButton").addEventListener("click", async () => {
	try {
		await request("/api/accounts/stop-all", { method: "POST" });
		await refresh();
		showToast("All accounts stopped.");
		logActivity("All accounts stopped", `${state.accounts.length} account(s)`);
	} catch (error) {
		await refresh();
		showToast(error.message);
	}
});

elements.selectAll.addEventListener("change", () => {
	document.querySelectorAll("input[data-account-id]").forEach((input) => {
		input.checked = elements.selectAll.checked;
	});
	updateSelectedCount();
});

if (window.gsap) {
	window.gsap.from("[data-reveal]", {
		duration: 0.8,
		ease: "power3.out",
		opacity: 0,
		stagger: 0.08,
		y: 24,
	});
}

renderActivity();
refresh().catch((error) => showToast(error.message));
