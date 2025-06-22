// === Updated script.js for Voice Assistant Dashboard with FastAPI Integration ===

const API_BASE = "http://127.0.0.1:8000";
let sidebarActive = false;
let currentChatId = null;
let selectedImage = null; // Store the selected image

// Create a new chat conversation
async function initChat() {
  try {
    const res = await fetch(`${API_BASE}/chats`, { method: "POST" });
    const data = await res.json();
    currentChatId = data.chat_id;
    return currentChatId;
  } catch (error) {
    showToast("Error creating new chat: " + error.message);
    console.error("Error creating chat:", error);
  }
}

// Send a message to the current chat
async function sendMessage() {
  const input = document.getElementById("message-input").value;
  if (!input.trim() && !selectedImage) return;

  // Create a new chat if none exists
  if (!currentChatId) {
    currentChatId = await initChat();
  }

  // Show loading spinner
  showLoadingSpinner();

  try {
    const res = await fetch(`${API_BASE}/chats/${currentChatId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: input, 
        chat_id: currentChatId,
        base64_image: selectedImage 
      })
    });

    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }

    const data = await res.json();
    
    // If there was an image, show indicator in the message
    let displayMessage = input;
    if (selectedImage) {
      // Show image icon alongside the message
      displayMessage = input + " 📷";
    }
    
    addMessage(displayMessage, "user");
    addMessage(data.response, "assistant");

    document.getElementById("message-input").value = "";
    
    // Clear the selected image
    selectedImage = null;
    updateImageIndicator();
    
    // Update chat list to show the new conversation
    await loadChats();
  } catch (error) {
    showToast("Error sending message: " + error.message);
    console.error("Error sending message:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Add a message to the messages container
function addMessage(text, role) {
  const container = document.getElementById("messages-container");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  
  // Add timestamp
  const timeDiv = document.createElement("div");
  timeDiv.className = "message-time";
  const now = new Date();
  timeDiv.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(timeDiv);
  
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Load all chat conversations
async function loadChats() {
  try {
    const res = await fetch(`${API_BASE}/chats`);
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    const list = document.getElementById("chats-list");
    list.innerHTML = "";
    
    data.conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    data.conversations.forEach(chat => {
      const li = document.createElement("li");
      li.textContent = chat.title;
      li.dataset.chatId = chat.id;
      if (chat.id === currentChatId) {
        li.classList.add("active");
      }
      li.onclick = () => selectChat(chat);
      list.appendChild(li);
    });
  } catch (error) {
    showToast("Error loading chats: " + error.message);
    console.error("Error loading chats:", error);
  }
}

// Select a chat conversation
function selectChat(chat) {
  currentChatId = chat.id;
  
  // Update chat title
  document.getElementById("current-chat-title").textContent = chat.title;
  
  // Mark this chat as active in the list
  const allChats = document.querySelectorAll("#chats-list li");
  allChats.forEach(item => {
    item.classList.remove("active");
    if (item.dataset.chatId === chat.id) {
      item.classList.add("active");
    }
  });
  
  // Clear and populate messages container
  const container = document.getElementById("messages-container");
  container.innerHTML = "";
  
  chat.messages.forEach(msgPair => {
    addMessage(msgPair[0], "user");
    addMessage(msgPair[1], "assistant");
  });
}

// Delete the current chat
async function deleteCurrentChat() {
  if (!currentChatId) return;
  
  if (!confirm("Delete this conversation?")) return;
  
  try {
    const res = await fetch(`${API_BASE}/chats/${currentChatId}`, { 
      method: "DELETE" 
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    // Clear messages and reset current chat
    document.getElementById("messages-container").innerHTML = "";
    document.getElementById("current-chat-title").textContent = "Select a chat to start";
    
    // Refresh chat list
    currentChatId = null;
    await loadChats();
    
    showToast("Chat deleted successfully");
  } catch (error) {
    showToast("Error deleting chat: " + error.message);
    console.error("Error deleting chat:", error);
  }
}

// Load all journal entries
async function loadJournalEntries() {
  try {
    const res = await fetch(`${API_BASE}/journal`);
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    const list = document.getElementById("journal-entries-list");
    list.innerHTML = "";
    
    data.journal_entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    data.journal_entries.forEach(entry => {
      const li = document.createElement("li");
      li.textContent = `${entry.date} ${entry.time}`;
      li.dataset.entryId = entry.id;
      li.onclick = () => displayJournalEntry(entry);
      list.appendChild(li);
    });
  } catch (error) {
    showToast("Error loading journal entries: " + error.message);
    console.error("Error loading journal entries:", error);
  }
}

// Display a journal entry
function displayJournalEntry(entry) {
  document.getElementById("journal-title").value = `${entry.date} ${entry.time}`;
  document.getElementById("journal-content").value = entry.content;
  
  const analysisElement = document.getElementById("journal-analysis");
  if (entry.emotion_analysis) {
    analysisElement.textContent = entry.emotion_analysis;
    analysisElement.classList.add("active");
  } else {
    analysisElement.textContent = "";
    analysisElement.classList.remove("active");
  }
  
  // Mark this entry as active
  const allEntries = document.querySelectorAll("#journal-entries-list li");
  allEntries.forEach(item => {
    item.classList.remove("active");
    if (item.dataset.entryId === entry.id) {
      item.classList.add("active");
    }
  });
  
  // Store current entry ID in a data attribute
  document.getElementById("journal-content").dataset.entryId = entry.id;
}

// Save a journal entry
async function saveJournal() {
  const content = document.getElementById("journal-content").value;
  if (!content.trim()) {
    showToast("Journal entry cannot be empty");
    return;
  }
  
  showLoadingSpinner();
  
  try {
    // Check if we're updating an existing entry
    const entryId = document.getElementById("journal-content").dataset.entryId;
    
    let url = `${API_BASE}/journal`;
    let method = "POST";
    let bodyData = { content };
    
    if (entryId) {
      // Update existing entry
      url = `${API_BASE}/journal/${entryId}`;
      method = "PUT";
      
      // Get analysis if it exists
      const analysis = document.getElementById("journal-analysis").textContent;
      if (analysis) {
        bodyData.emotion_analysis = analysis;
      }
    }
    
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData)
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    // Refresh journal entries
    await loadJournalEntries();
    
    // Clear the form if it was a new entry
    if (!entryId) {
      clearJournalForm();
    }
    
    showToast("Journal entry saved successfully");
  } catch (error) {
    showToast("Error saving journal entry: " + error.message);
    console.error("Error saving journal entry:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Delete a journal entry
async function deleteJournalEntry() {
  const entryId = document.getElementById("journal-content").dataset.entryId;
  if (!entryId) return;
  
  if (!confirm("Delete this journal entry?")) return;
  
  showLoadingSpinner();
  
  try {
    const res = await fetch(`${API_BASE}/journal/${entryId}`, { 
      method: "DELETE" 
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    // Refresh journal entries
    await loadJournalEntries();
    
    // Clear the form
    clearJournalForm();
    
    showToast("Journal entry deleted successfully");
  } catch (error) {
    showToast("Error deleting journal entry: " + error.message);
    console.error("Error deleting journal entry:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Clear the journal form
function clearJournalForm() {
  document.getElementById("journal-title").value = "";
  document.getElementById("journal-content").value = "";
  document.getElementById("journal-content").dataset.entryId = "";
  document.getElementById("journal-analysis").textContent = "";
  document.getElementById("journal-analysis").classList.remove("active");
}

// Create a new journal entry
function newJournalEntry() {
  clearJournalForm();
  
  // Set default title with current date and time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
  
  document.getElementById("journal-title").value = `${dateStr} ${timeStr}`;
}

// Analyze a journal entry
async function analyzeJournal() {
  const content = document.getElementById("journal-content").value;
  if (!content.trim()) {
    showToast("Journal entry cannot be empty");
    return;
  }
  
  showLoadingSpinner();
  
  try {
    const res = await fetch(`${API_BASE}/journal/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    
    const analysisElement = document.getElementById("journal-analysis");
    analysisElement.textContent = data.analysis;
    analysisElement.classList.add("active");
    
    showToast("Analysis complete");
  } catch (error) {
    showToast("Error analyzing journal entry: " + error.message);
    console.error("Error analyzing journal entry:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Delete all memory
async function deleteMemory() {
  if (!confirm("Delete ALL memory? This will remove all chat history and journal entries. This action cannot be undone.")) {
    return;
  }
  
  showLoadingSpinner();
  
  try {
    const res = await fetch(`${API_BASE}/memory`, { method: "DELETE" });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    // Clear messages container
    document.getElementById("messages-container").innerHTML = "";
    document.getElementById("current-chat-title").textContent = "Select a chat to start";
    
    // Clear journal entries
    clearJournalForm();
    
    // Reset current chat ID
    currentChatId = null;
    
    // Refresh lists
    await loadChats();
    await loadJournalEntries();
    
    showToast("All memory cleared successfully");
  } catch (error) {
    showToast("Error clearing memory: " + error.message);
    console.error("Error clearing memory:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Load user settings
async function loadSettings() {
  try {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    
    // Set values in form
    document.getElementById("system-prompt").value = data.settings.system_prompt;
    
    // Load disability templates
    await loadDisabilityTemplates();
  } catch (error) {
    showToast("Error loading settings: " + error.message);
    console.error("Error loading settings:", error);
  }
}

// Load disability templates
async function loadDisabilityTemplates() {
  try {
    const res = await fetch(`${API_BASE}/disability-templates`);
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    const data = await res.json();
    
    // Populate template select
    const select = document.getElementById("disability-template");
    
    // Keep first option
    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);
    
    // Add template options
    for (const [name, template] of Object.entries(data.templates)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    }
    
    // Add change event listener
    select.onchange = function() {
      if (this.value) {
        // Preview the template
        const templateContent = data.templates[this.value];
        document.getElementById("template-preview").textContent = templateContent;
        document.getElementById("system-prompt").value = templateContent;
      } else {
        document.getElementById("template-preview").textContent = "";
      }
    };
  } catch (error) {
    showToast("Error loading disability templates: " + error.message);
    console.error("Error loading disability templates:", error);
  }
}

// Save user settings
async function saveSettings() {
  const systemPrompt = document.getElementById("system-prompt").value;
  const template = document.getElementById("disability-template").value;
  
  showLoadingSpinner();
  
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_type: template ? "Specially Abled" : "Regular",
        disability_type: template || null,
        system_prompt: systemPrompt
      })
    });
    
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    
    showToast("Settings saved successfully");
  } catch (error) {
    showToast("Error saving settings: " + error.message);
    console.error("Error saving settings:", error);
  } finally {
    hideLoadingSpinner();
  }
}

// Show toast notification
function showToast(message) {
  const toast = document.getElementById("toast");
  const toastMessage = toast.querySelector(".toast-message");
  
  toastMessage.textContent = message;
  toast.classList.add("active");
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove("active");
  }, 4000);
}

// Show loading spinner
function showLoadingSpinner() {
  document.getElementById("loading-spinner").classList.add("active");
}

// Hide loading spinner
function hideLoadingSpinner() {
  document.getElementById("loading-spinner").classList.remove("active");
}

// Setup tab navigation
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const contentSections = document.querySelectorAll(".content-section");
  
  navItems.forEach(item => {
    if (!item.dataset.target) return;
    
    item.addEventListener("click", () => {
      // Remove active class from all items
      navItems.forEach(navItem => navItem.classList.remove("active"));
      contentSections.forEach(section => section.classList.remove("active"));
      
      // Add active class to clicked item
      item.classList.add("active");
      
      // Show corresponding section
      const targetSection = document.getElementById(item.dataset.target);
      if (targetSection) {
        targetSection.classList.add("active");
      }
    });
  });
}

// Setup modals
function setupModals() {
  // API docs modal
  document.getElementById("docs-link").addEventListener("click", () => {
    document.getElementById("docs-modal").classList.add("active");
  });
  
  // New chat modal
  document.getElementById("new-chat-btn").addEventListener("click", async () => {
    await initChat();
    document.getElementById("messages-container").innerHTML = "";
    document.getElementById("current-chat-title").textContent = "New Conversation";
    showToast("New chat created");
  });
  
  // Close modal buttons
  document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
      });
    });
  });
}

// Setup theme switching
function setupThemeSwitching() {
  const themeSwitch = document.getElementById("theme-switch");
  
  // Check for saved theme preference
  const darkMode = localStorage.getItem("darkMode") === "true";
  
  // Apply theme
  if (darkMode) {
    document.body.classList.add("dark-theme");
    themeSwitch.checked = true;
  }
  
  // Add change event listener
  themeSwitch.addEventListener("change", () => {
    if (themeSwitch.checked) {
      document.body.classList.add("dark-theme");
      localStorage.setItem("darkMode", "true");
    } else {
      document.body.classList.remove("dark-theme");
      localStorage.setItem("darkMode", "false");
    }
  });
}

// Show image indicator in the message input area
function updateImageIndicator() {
  const uploadBtn = document.getElementById("upload-image-btn");
  
  if (selectedImage) {
    uploadBtn.innerHTML = '<i class="fas fa-image" style="color: var(--primary-color);"></i>';
    uploadBtn.title = "Image selected (click to change)";
  } else {
    uploadBtn.innerHTML = '<i class="fas fa-image"></i>';
    uploadBtn.title = "Upload Image";
  }
}

// Handle image selection
function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    selectedImage = reader.result.split(",")[1];
    updateImageIndicator();
    
    // Focus the message input so user can add text
    document.getElementById("message-input").focus();
    
    showToast("Image selected - add your message and send");
  };
  reader.readAsDataURL(file);
}

// Setup event listeners for input form submission
function setupInputListeners() {
  // Send message on enter (but not with shift+enter)
  document.getElementById("message-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Send message button
  document.getElementById("send-message-btn").addEventListener("click", sendMessage);
  
  // Image upload
  document.getElementById("upload-image-btn").addEventListener("click", () => {
    document.getElementById("image-input").click();
  });
  
  const input = document.querySelector('#some-input');
if (input) {
  input.addEventListener('keydown', someFunction);
}

  
  // Save journal button
  document.getElementById("save-journal-btn").addEventListener("click", saveJournal);
  
  // New journal button
  document.getElementById("new-journal-btn").addEventListener("click", newJournalEntry);
  
  // Analyze journal button
  document.getElementById("analyze-journal-btn").addEventListener("click", analyzeJournal);
  
  // Delete journal button
  document.getElementById("delete-journal-btn").addEventListener("click", deleteJournalEntry);
  
  // Delete chat button
  document.getElementById("delete-chat-btn").addEventListener("click", deleteCurrentChat);
  
  // Save settings button
  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
  
  // Clear memory button
  document.getElementById("clear-memory-btn").addEventListener("click", deleteMemory);
  document.getElementById("confirm-clear-memory").addEventListener("click", deleteMemory);
}

// Initialize the application
window.onload = async () => {
  setupNavigation();
  setupModals();
  setupThemeSwitching();
  setupInputListeners();
  setupFloatingActionBar();

  
  // Load initial data
  await loadChats();
  await loadJournalEntries();
  await loadSettings();
  
};
function setupFloatingActionBar() {
  const toggleBtn = document.getElementById("toggleSidebarBtn");
  const newChatBtn = document.querySelector(".new-chat-btn");
  const searchBtn = document.querySelector(".search-btn");
  const sidebar = document.querySelector(".sidebar");

  toggleBtn.onclick = () => {
    sidebar.classList.toggle("collapsed");
  };

  newChatBtn.onclick = () => {
    startNewChat(); // Your existing function or fallback
  };

  searchBtn.onclick = () => {
    const searchSection = document.querySelector("#search-section");
    const journalSection = document.querySelector("#journal-section");
    if (searchSection) searchSection.scrollIntoView({ behavior: "smooth" });
  };
}

