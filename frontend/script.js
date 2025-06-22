document.addEventListener('DOMContentLoaded', function() {
    const API_BASE = "http://127.0.0.1:8000";
    let currentChatId = null;
    let selectedImage = null; // Store the selected image

    // Theme Toggle
    const themeSwitch = document.getElementById('theme-switch');
    const body = document.body;

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        themeSwitch.checked = true;
    }

    // Theme toggle event listener
    themeSwitch.addEventListener('change', function() {
        if (this.checked) {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
    });

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarState', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    });

    // Check for saved sidebar state
    const savedSidebarState = localStorage.getItem('sidebarState');
    if (savedSidebarState === 'collapsed') {
        sidebar.classList.add('collapsed');
    }

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');

    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');

            // Update active nav item
            navItems.forEach(navItem => navItem.classList.remove('active'));
            this.classList.add('active');

            // Show target section
            contentSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) {
                    section.classList.add('active');
                }
            });

            // Save active section to localStorage
            localStorage.setItem('activeSection', targetId);

            // On mobile, collapse sidebar after selection
            if (window.innerWidth <= 768) {
                sidebar.classList.add('collapsed');
            }
        });
    });

    // Check for saved active section
    const savedActiveSection = localStorage.getItem('activeSection');
    if (savedActiveSection) {
        const activeNavItem = document.querySelector(`.nav-item[data-target="${savedActiveSection}"]`);
        if (activeNavItem) {
            activeNavItem.click();
        }
    }

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
            return null;
        }
    }

    // New Chat Button
    const newChatBtn = document.getElementById('new-chat-btn');
    const newChatModal = document.getElementById('new-chat-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    const createChatBtn = document.getElementById('create-chat-btn');
    const chatsList = document.getElementById('chats-list');
    const messagesContainer = document.getElementById('messages-container');
    const currentChatTitle = document.getElementById('current-chat-title');
    const deleteChatBtn = document.getElementById('delete-chat-btn');

    // Open new chat modal
    newChatBtn.addEventListener('click', async function() {
        newChatModal.style.display = 'flex';
        document.getElementById('new-chat-title').value = '';
        document.getElementById('new-chat-title').focus();
    });

    // Create chat button
    createChatBtn.addEventListener('click', async function() {
        const title = document.getElementById('new-chat-title').value.trim() || 'New Conversation';
        
        const newChatId = await initChat();
        if (newChatId) {
            messagesContainer.innerHTML = '';
            currentChatTitle.textContent = title;
            
            // Add the new chat to the list
            const chatItem = document.createElement('li');
            chatItem.className = 'chat-item active';
            chatItem.textContent = title;
            chatItem.dataset.chatId = newChatId;
            chatsList.prepend(chatItem);
            
            // Show delete button
            deleteChatBtn.style.display = 'flex';
            
            // Close the modal
            newChatModal.style.display = 'none';
            
            showToast("New chat created");
        }
    });

    // Close modals
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.style.display = 'none';
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    // Load all chat conversations
    async function loadChats() {
        try {
            const res = await fetch(`${API_BASE}/chats`);
            if (!res.ok) {
                throw new Error(`Server responded with status: ${res.status}`);
            }
            
            const data = await res.json();
            chatsList.innerHTML = "";
            
            data.conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            data.conversations.forEach(chat => {
                const li = document.createElement("li");
                li.className = "chat-item";
                li.textContent = chat.title;
                li.dataset.chatId = chat.id;
                if (chat.id === currentChatId) {
                    li.classList.add("active");
                }
                li.addEventListener('click', () => selectChat(chat));
                chatsList.appendChild(li);
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
        currentChatTitle.textContent = chat.title;
        
        // Mark this chat as active in the list
        const allChats = document.querySelectorAll(".chat-item");
        allChats.forEach(item => {
            item.classList.remove("active");
            if (item.dataset.chatId === chat.id) {
                item.classList.add("active");
            }
        });
        
        // Clear and populate messages container
        messagesContainer.innerHTML = "";
        
        chat.messages.forEach(msgPair => {
            addMessage(msgPair[0], "user");
            addMessage(msgPair[1], "ai");
        });

        // Show delete button
        deleteChatBtn.style.display = 'flex';
    }

    // Delete chat
    deleteChatBtn.addEventListener('click', async function() {
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
            messagesContainer.innerHTML = "";
            currentChatTitle.textContent = "Select a chat to start";
            
            // Refresh chat list
            currentChatId = null;
            await loadChats();
            
            // Hide delete button
            deleteChatBtn.style.display = 'none';
            
            showToast("Chat deleted successfully");
        } catch (error) {
            showToast("Error deleting chat: " + error.message);
            console.error("Error deleting chat:", error);
        }
    });

    // Send message
    const messageInput = document.getElementById('message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');

    async function sendMessage() {
        const input = messageInput.value.trim();
        if (!input && !selectedImage) return;

        // Create a new chat if none exists
        if (!currentChatId) {
            currentChatId = await initChat();
            if (!currentChatId) return;
            currentChatTitle.textContent = "New Conversation";
        }

        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';

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
            addMessage(data.response, "ai");

            messageInput.value = "";
            
            // Clear the selected image
            selectedImage = null;
            updateImageIndicator();
            
            // Update chat list to show the new conversation
            await loadChats();
            
            // Show delete button
            deleteChatBtn.style.display = 'flex';
        } catch (error) {
            showToast("Error sending message: " + error.message);
            console.error("Error sending message:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    }

    sendMessageBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
    
        if (role === "ai") {
            div.innerHTML = marked.parse(text);  // render markdown
        } else {
            div.textContent = text;
        }
    
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    

    // Voice input button
    const voiceInputBtn = document.getElementById('voice-input-btn');

    voiceInputBtn.addEventListener('click', function() {
        // Check if browser supports speech recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.interimResults = false;

            recognition.start();

            // Show toast notification
            showToast('Listening... Speak now.');

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                messageInput.value = transcript;
                showToast('Voice captured!');
            };

            recognition.onerror = function(event) {
                showToast('Error occurred in recognition: ' + event.error);
            };
        } else {
            showToast('Speech recognition not supported in this browser.');
        }
    });

    // Upload image button
    const uploadImageBtn = document.getElementById('upload-image-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = 'image-input';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    uploadImageBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Check file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast('Image too large. Please select an image under 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            selectedImage = e.target.result.split(',')[1];
            updateImageIndicator();
            
            // Focus the message input so user can add text
            messageInput.focus();
            
            showToast("Image selected - add your message and send");
        };
        reader.readAsDataURL(file);
    });

    // Show image indicator in the message input area
    function updateImageIndicator() {
        if (selectedImage) {
            uploadImageBtn.innerHTML = '<i class="fas fa-image" style="color: var(--primary-color);"></i>';
            uploadImageBtn.title = "Image selected (click to change)";
        } else {
            uploadImageBtn.innerHTML = '<i class="fas fa-image"></i>';
            uploadImageBtn.title = "Upload Image";
        }
    }

    // Journal functionality
    const newJournalBtn = document.getElementById('new-journal-btn');
    const journalEntriesList = document.getElementById('journal-entries-list');
    const journalTitle = document.getElementById('journal-title');
    const journalContent = document.getElementById('journal-content');
    const saveJournalBtn = document.getElementById('save-journal-btn');
    const deleteJournalBtn = document.getElementById('delete-journal-btn');
    const analyzeJournalBtn = document.getElementById('analyze-journal-btn');
    const journalAnalysis = document.getElementById('journal-analysis');

    // Load all journal entries
    async function loadJournalEntries() {
        try {
            const res = await fetch(`${API_BASE}/journal`);
            if (!res.ok) {
                throw new Error(`Server responded with status: ${res.status}`);
            }
            
            const data = await res.json();
            journalEntriesList.innerHTML = "";
            
            data.journal_entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            data.journal_entries.forEach(entry => {
                const li = document.createElement("li");
                li.className = "journal-item";
                li.textContent = `${entry.date} ${entry.time}`;
                li.dataset.entryId = entry.id;
                li.addEventListener('click', () => displayJournalEntry(entry));
                journalEntriesList.appendChild(li);
            });
        } catch (error) {
            showToast("Error loading journal entries: " + error.message);
            console.error("Error loading journal entries:", error);
        }
    }

    // Display a journal entry
    function displayJournalEntry(entry) {
        journalTitle.value = `${entry.date} ${entry.time}`;
        journalContent.value = entry.content;
        
        if (entry.emotion_analysis) {
            journalAnalysis.innerHTML = entry.emotion_analysis;
            journalAnalysis.style.display = 'block';
        } else {
            journalAnalysis.innerHTML = "";
            journalAnalysis.style.display = 'none';
        }
        
        // Mark this entry as active
        const allEntries = document.querySelectorAll(".journal-item");
        allEntries.forEach(item => {
            item.classList.remove("active");
            if (item.dataset.entryId === entry.id) {
                item.classList.add("active");
            }
        });
        
        // Store current entry ID in a data attribute
        journalContent.dataset.entryId = entry.id;
    }

    // Clear the journal form
    function clearJournalForm() {
        journalTitle.value = "";
        journalContent.value = "";
        journalContent.dataset.entryId = "";
        journalAnalysis.innerHTML = "";
        journalAnalysis.style.display = 'none';
    }

    // New journal entry
    newJournalBtn.addEventListener('click', function() {
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
        
        journalTitle.value = `${dateStr} ${timeStr}`;
        
        // Focus on content input
        journalContent.focus();
    });

    // Save journal entry
    saveJournalBtn.addEventListener('click', async function() {
        const content = journalContent.value.trim();
        if (!content) {
            showToast("Journal entry cannot be empty");
            return;
        }
        
        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';
        
        try {
            // Check if we're updating an existing entry
            const entryId = journalContent.dataset.entryId;
            
            let url = `${API_BASE}/journal`;
            let method = "POST";
            let bodyData = { content };
            
            if (entryId) {
                // Update existing entry
                url = `${API_BASE}/journal/${entryId}`;
                method = "PUT";
                
                // Get analysis if it exists
                const analysis = journalAnalysis.textContent;
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
            
            showToast("Journal entry saved successfully!");
        } catch (error) {
            showToast("Error saving journal entry: " + error.message);
            console.error("Error saving journal entry:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    });

    // Delete journal entry
    deleteJournalBtn.addEventListener('click', async function() {
        const entryId = journalContent.dataset.entryId;
        if (!entryId) return;
        
        if (!confirm('Are you sure you want to delete this journal entry?')) return;
        
        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';
        
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
            
            showToast("Journal entry deleted.");
        } catch (error) {
            showToast("Error deleting journal entry: " + error.message);
            console.error("Error deleting journal entry:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    });

    // Analyze journal entry
    analyzeJournalBtn.addEventListener('click', async function() {
        const content = journalContent.value.trim();
        if (!content) {
            showToast("Please write some content before analyzing.");
            return;
        }
        
        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';
        
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
            
            // Show analysis
            journalAnalysis.innerHTML = data.analysis;
            journalAnalysis.style.display = 'block';
            
            showToast("Analysis complete");
        } catch (error) {
            showToast("Error analyzing journal entry: " + error.message);
            console.error("Error analyzing journal entry:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    });
    async function loadSettings() {
        try {
            const res = await fetch(`${API_BASE}/settings`);
            if (!res.ok) {
                throw new Error(`Server responded with status: ${res.status}`);
            }
            
            const data = await res.json();
            
            // Set values in form
            systemPrompt.value = data.settings.system_prompt;
            
            // Load disability templates
            await loadDisabilityTemplates();
            
            // Set selected template if available
            if (data.settings.selected_template && disabilityTemplate) {
                disabilityTemplate.value = data.settings.selected_template;
                
                // Trigger change event to show preview
                const event = new Event('change');
                disabilityTemplate.dispatchEvent(event);
            }
        } catch (error) {
            showToast("Error loading settings: " + error.message);
            console.error("Error loading settings:", error);
        }
    }

    // Settings functionality
    const systemPrompt = document.getElementById('system-prompt');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const disabilityTemplate = document.getElementById('disability-template');
    const templatePreview = document.getElementById('template-preview');

    // Load settings from API
    async function loadSettings() {
        try {
            const res = await fetch(`${API_BASE}/settings`);
            if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);
            const data = await res.json();
    
            // Set values in form
            systemPrompt.value = data.settings.system_prompt;
    
            // Load disability templates
            await loadDisabilityTemplates();
    
            // Set selected template if available
            if (data.settings.selected_template && disabilityTemplate) {
                disabilityTemplate.value = data.settings.selected_template;
    
                // Trigger change event to show preview and sync prompt field
                const event = new Event('change');
                disabilityTemplate.dispatchEvent(event);
            }
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
            disabilityTemplate.innerHTML = '<option value="">Select a template...</option>';
            
            // Add template options
            for (const [name, template] of Object.entries(data.templates)) {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                disabilityTemplate.appendChild(option);
            }
            
            // Add change event listener
            disabilityTemplate.onchange = function() {
                if (this.value) {
                    // Preview the template
                    const templateContent = data.templates[this.value];
                    templatePreview.innerHTML = templateContent;
                    templatePreview.style.display = 'block';
                    systemPrompt.value = templateContent;
                } else {
                    templatePreview.innerHTML = "";
                    templatePreview.style.display = 'none';
                }
            };
        } catch (error) {
            showToast("Error loading disability templates: " + error.message);
            console.error("Error loading disability templates:", error);
        }
    }

    // Save settings
    saveSettingsBtn.addEventListener('click', async function() {
        const promptValue = systemPrompt.value;
        const templateValue = disabilityTemplate.value;
        
        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';
        
        try {
            const res = await fetch(`${API_BASE}/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_type: templateValue ? "Specially Abled" : "Regular",
                    disability_type: templateValue || null,
                    system_prompt: promptValue
                })
            });
            
            if (!res.ok) {
                throw new Error(`Server responded with status: ${res.status}`);
            }
            
            showToast("Settings saved successfully!");
        } catch (error) {
            showToast("Error saving settings: " + error.message);
            console.error("Error saving settings:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    });

    // Memory section
    const confirmClearMemory = document.getElementById('confirm-clear-memory');

    confirmClearMemory.addEventListener('click', async function() {
        // Show loading indicator
        const loadingSpinner = document.getElementById('loading-spinner');
        loadingSpinner.style.display = 'flex';
        
        try {
            const res = await fetch(`${API_BASE}/memory`, { method: "DELETE" });
            
            if (!res.ok) {
                throw new Error(`Server responded with status: ${res.status}`);
            }
            
            // Clear messages container
            messagesContainer.innerHTML = "";
            currentChatTitle.textContent = "Select a chat to start";
            
            // Clear journal entries
            clearJournalForm();
            
            // Reset current chat ID
            currentChatId = null;
            
            // Refresh lists
            await loadChats();
            await loadJournalEntries();
            
            // Hide warning
            document.querySelector('.memory-warning').style.display = 'none';
            
            showToast("All memory cleared successfully");
        } catch (error) {
            showToast("Error clearing memory: " + error.message);
            console.error("Error clearing memory:", error);
        } finally {
            // Hide loading indicator
            loadingSpinner.style.display = 'none';
        }
    });

    // Toast notification
    function showToast(message) {
        const toast = document.getElementById('toast');
        const toastMessage = document.querySelector('.toast-message');
        const toastProgress = document.querySelector('.toast-progress');

        toastMessage.textContent = message;
        toast.style.display = 'block';

        // Animate progress bar
        toastProgress.style.width = '100%';
        toastProgress.style.transition = 'width 3s linear';
        toastProgress.style.width = '0%';

        // Hide toast after 3 seconds
        setTimeout(function() {
            toast.style.display = 'none';
            toastProgress.style.transition = 'none';
            toastProgress.style.width = '100%';
        }, 3000);
    }

    // Show/hide loading spinner
    function showLoadingSpinner() {
        document.getElementById('loading-spinner').style.display = 'flex';
    }
    
    function hideLoadingSpinner() {
        document.getElementById('loading-spinner').style.display = 'none';
    }

    // Toggle recent chats functionality
    const toggleRecentChats = document.getElementById('toggle-recent-chats');
    const chatList = document.querySelector('.chat-list');

    if (toggleRecentChats && chatList) {
        toggleRecentChats.addEventListener('click', function() {
            chatList.classList.toggle('collapsed');
            if (chatList.classList.contains('collapsed')) {
                this.innerHTML = '<i class="fas fa-chevron-right"></i>';
            } else {
                this.innerHTML = '<i class="fas fa-chevron-left"></i>';
            }
        });
    }

    // Initialize
    function init() {
        loadChats();
        loadJournalEntries();
        loadSettings();
        
        // Hide delete buttons initially
        if (deleteChatBtn) {
            deleteChatBtn.style.display = 'none';
        }
    }

    init();
});