import streamlit as st
import os
import chromadb
from datetime import datetime
import google.generativeai as genai
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import json
import uuid
import pandas as pd
import base64
from PIL import Image
import io

# Load environment variables
load_dotenv()

# Initialize Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('models/gemini-2.0-flash-exp-image-generation')

# App title and configuration
st.set_page_config(
    page_title="Memory-Enabled Assistant",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Constants for local storage
JOURNAL_FILE = "journal_entries.json"
CONVERSATIONS_FILE = "conversations.json"
SETTINGS_FILE = "settings.json"

# File operations for persistence
def save_to_file(data, filename):
    """Save data to a JSON file"""
    with open(filename, 'w') as f:
        json.dump(data, f)

def load_from_file(filename):
    """Load data from a JSON file"""
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def load_settings():
    """Load user settings"""
    try:
        with open(SETTINGS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {
            "user_type": "Regular",
            "disability_type": None,
            "system_prompt": "You are a helpful assistant with memory of past conversations. Give response like Humans do. Give a professional and accurate response."
        }

def save_settings(settings):
    """Save user settings"""
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f)

# Initialize session state for current chat
if "current_chat_id" not in st.session_state:
    st.session_state.current_chat_id = str(uuid.uuid4())
if "chat_title" not in st.session_state:
    st.session_state.chat_title = "New Conversation"
if "chat_messages" not in st.session_state:
    st.session_state.chat_messages = []
if "expanded_entries" not in st.session_state:
    st.session_state.expanded_entries = set()
if "uploaded_image" not in st.session_state:
    st.session_state.uploaded_image = None

# Load persistent data
if "conversations" not in st.session_state:
    st.session_state.conversations = load_from_file(CONVERSATIONS_FILE)
if "journal_entries" not in st.session_state:
    st.session_state.journal_entries = load_from_file(JOURNAL_FILE)
if "settings" not in st.session_state:
    st.session_state.settings = load_settings()

# Memory handler for long-term memory
class MemoryHandler:
    def __init__(self, collection_name: str = "memory_store"):
        self.client = chromadb.PersistentClient(path="./memory_db")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        
        try:
            self.collection = self.client.get_collection(name=collection_name)
        except:
            self.collection = self.client.create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"}
            )
    
    def format_timestamp(self, timestamp_str):
        dt = datetime.fromisoformat(timestamp_str)
        return dt.strftime("%B %d, %Y at %I:%M %p")
    
    def generate_embedding(self, text: str):
        return self.embedding_model.encode(text).tolist()
    
    def add_memory(self, text: str, chat_id: str):
        timestamp = datetime.now().isoformat()
        embedding = self.generate_embedding(text)
        
        memory_id = f"mem_{chat_id}_{timestamp}"
        self.collection.add(
            embeddings=[embedding],
            documents=[text],
            metadatas=[{"timestamp": timestamp, "chat_id": chat_id}],
            ids=[memory_id]
        )
        return memory_id
    
    def get_relevant_memories(self, query: str, chat_id: str, k: int = 3):
        query_embedding = self.generate_embedding(query)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            include=["documents", "metadatas"]
        )
        
        if not results['documents'][0]:
            return []
        
        memories = []
        for doc, meta in zip(results['documents'][0], results['metadatas'][0]):
            memories.append({
                "text": doc,
                "timestamp": meta['timestamp']
            })
        
        return memories
    
    def add_journal_entry(self, entry_text: str, entry_id=None):
        """Add a journal entry to memory"""
        timestamp = datetime.now().isoformat()
        embedding = self.generate_embedding(entry_text)
        
        if not entry_id:
            entry_id = f"journal_{timestamp}"
            
        self.collection.add(
            embeddings=[embedding],
            documents=[entry_text],
            metadatas=[{"timestamp": timestamp, "type": "journal"}],
            ids=[entry_id]
        )
        return entry_id, timestamp
    
    def delete_memory(self, memory_id):
        """Delete a specific memory by ID"""
        try:
            self.collection.delete(ids=[memory_id])
            return True
        except Exception as e:
            st.error(f"Error deleting memory: {e}")
            return False
    
    def delete_all_memories(self):
        """Delete all memories from the collection"""
        try:
            # Get all IDs from the collection
            all_ids = self.collection.get()["ids"]
            if all_ids:
                self.collection.delete(ids=all_ids)
            return True
        except Exception as e:
            st.error(f"Error deleting all memories: {e}")
            return False
    
    def analyze_emotion(self, journal_text):
        """Analyze the emotional content of a journal entry using Gemini"""
        prompt = f"""
        Analyze the emotional state of the person mentioned in this journal entry. 
        Look for mentions of their name, and refer to them by name if available.
        If no name is mentioned, use neutral terms like "the person" or "they".
        
        Give a brief, empathetic summary of their emotional state, activities, and mood.
        Be conversational but insightful. Keep it to 2-3 sentences.
        
        Journal entry: {journal_text}
        """
        
        response = model.generate_content(prompt).text
        return response
    
    def process_image_input(self, image):
        """Process an uploaded image and return a description"""
        if image is not None:
            try:
                return model.generate_content(["Describe this image:", image]).text
            except Exception as e:
                return f"Error processing image: {str(e)}"
        return None
    
    def generate_response(self, message, chat_id, image=None):
        # Process image if provided
        image_description = self.process_image_input(image) if image else None
        
        # Get relevant memories
        memories = self.get_relevant_memories(message, chat_id)
        
        # Get current journal entries for context
        journal_context = ""
        if st.session_state.journal_entries:
            recent_entries = st.session_state.journal_entries[-3:]  # Get last 3 entries
            journal_context = "\n".join([
                f"Journal entry from {entry['date']}: {entry['content']}" 
                for entry in recent_entries
            ])
        
        context = ""
        if memories:
            context = "\n".join([
                f"Previous interaction ({self.format_timestamp(m['timestamp'])}): {m['text']}" 
                for m in memories
            ])
        
        system_prompt = st.session_state.settings["system_prompt"]
        
        full_prompt = f"{system_prompt}\n\n"
        
        if image_description:
            full_prompt += f"Image description: {image_description}\n\n"
        
        if context:
            full_prompt += f"Context from past interactions:\n{context}\n\n"
        
        if journal_context:
            full_prompt += f"Recent journal entries:\n{journal_context}\n\n"
        
        full_prompt += f"User: {message}"
        
        response = model.generate_content(full_prompt).text
        
        # Store the new interaction with current timestamp
        self.add_memory(f"User: {message}\nAssistant: {response}", chat_id)
        
        return response


# Initialize memory handler
memory_handler = MemoryHandler()

# Predefined templates for specially abled users
disability_templates = {
    "Autism Spectrum Disorder (ASD)": """You are a specialized assistant helping parents, teachers, and caregivers of individuals with Autism Spectrum Disorder (ASD). Your responses will:

1. Use evidence-based approaches from TEACCH, ABA, and DIR/Floortime methodologies
2. Provide visual schedule recommendations and structured routine guidance when applicable
3. Explain sensory processing considerations with practical accommodation strategies
4. Offer concrete examples rather than abstract concepts
5. Include social narrative templates and visual supports when helpful
6. Recognize both challenges and strengths associated with autism
7. Suggest environmental modifications that support regulation and learning
8. Balance developmental needs with neurodiversity-affirming approaches

In your responses, prioritize practical, implementable strategies backed by research while maintaining a respectful, person-first perspective that acknowledges the individual's unique strengths and challenges.""",

    "ADHD": """You are a specialized assistant helping parents, teachers, and caregivers of individuals with Attention Deficit Hyperactivity Disorder (ADHD). Your responses will:

1. Incorporate evidence-based behavioral management strategies from Barkley's model and cognitive-behavioral approaches
2. Recommend structured environmental modifications that support executive functioning
3. Provide clear scaffolding techniques for task completion and time management
4. Offer specific positive reinforcement strategies and motivation systems
5. Suggest ways to incorporate movement and address hyperactivity constructively
6. Include strategies for supporting emotional regulation and frustration tolerance
7. Balance medication information (when asked) with behavioral and environmental interventions
8. Emphasize strengths-based approaches while addressing practical challenges

Present information in easily digestible formats with clear action steps, recognizing the executive functioning challenges while maintaining focus on abilities and potential.""",

    "Dyslexia": """You are a specialized assistant helping parents, teachers, and caregivers of individuals with Dyslexia. Your responses will:

1. Incorporate evidence-based literacy approaches including Orton-Gillingham, Wilson Reading System, and structured literacy principles
2. Explain the science of reading as it relates to dyslexia interventions
3. Recommend appropriate accommodations for different educational contexts
4. Suggest assistive technology solutions that support independent learning
5. Provide strategies for building confidence and addressing anxiety around reading
6. Include multisensory learning approaches when applicable
7. Offer guidance on appropriate assessment and educational planning
8. Balance remediation strategies with accommodation needs

Present information with clarity about the neurobiological basis of dyslexia while maintaining an emphasis on literacy development as a skill that can improve with appropriate support and intervention.""",

    "Speech_Delay": """You are a specialized assistant helping parents, teachers, and caregivers of individuals with Speech and Language Delays. Your responses will:

1. Incorporate evidence-based approaches from developmental speech-language pathology
2. Suggest language stimulation techniques appropriate for developmental stage
3. Provide guidance on creating communication-rich environments
4. Recommend appropriate play-based intervention strategies
5. Include information on augmentative and alternative communication when appropriate
6. Offer strategies for supporting both receptive and expressive language development
7. Address concerns about multilingual development when applicable
8. Balance direct intervention recommendations with naturalistic language support

Present information that empowers caregivers to support communication development through everyday interactions while recognizing when specialized intervention may be necessary."""
}

# Function to create a new chat
def create_new_chat():
    chat_id = str(uuid.uuid4())
    st.session_state.current_chat_id = chat_id
    st.session_state.chat_title = "New Conversation"
    st.session_state.chat_messages = []
    st.session_state.uploaded_image = None
    
    # Add empty conversation to list
    st.session_state.conversations.append({
        "id": chat_id,
        "title": "New Conversation",
        "messages": [],
        "timestamp": datetime.now().isoformat()
    })
    save_to_file(st.session_state.conversations, CONVERSATIONS_FILE)
    
    # Force a rerun to update the UI
    st.rerun()

# Function to toggle journal entry expansion
def toggle_entry_expansion(entry_id):
    if entry_id in st.session_state.expanded_entries:
        st.session_state.expanded_entries.remove(entry_id)
    else:
        st.session_state.expanded_entries.add(entry_id)

# Function to delete journal entry
def delete_journal_entry(entry_id):
    # Delete from memory storage
    memory_handler.delete_memory(entry_id)
    
    # Delete from session state
    for i, entry in enumerate(st.session_state.journal_entries):
        if entry["id"] == entry_id:
            del st.session_state.journal_entries[i]
            break
    
    # Save updated entries
    save_to_file(st.session_state.journal_entries, JOURNAL_FILE)
    
    # Remove from expanded entries if present
    if entry_id in st.session_state.expanded_entries:
        st.session_state.expanded_entries.remove(entry_id)
    
    st.success("Journal entry deleted successfully!")
    st.rerun()

# Function to load an existing chat
def load_chat(chat_id):
    for conv in st.session_state.conversations:
        if conv["id"] == chat_id:
            st.session_state.current_chat_id = chat_id
            st.session_state.chat_title = conv["title"]
            st.session_state.chat_messages = conv["messages"]
            break
    
    # Force a rerun to update the UI
    st.rerun()

# Function to save current chat
def save_current_chat():
    # Find the current chat in the conversations list
    found = False
    for i, conv in enumerate(st.session_state.conversations):
        if conv["id"] == st.session_state.current_chat_id:
            # Update the conversation
            st.session_state.conversations[i]["title"] = st.session_state.chat_title
            st.session_state.conversations[i]["messages"] = st.session_state.chat_messages
            st.session_state.conversations[i]["timestamp"] = datetime.now().isoformat()
            found = True
            break
    
    # If not found, add a new conversation
    if not found:
        st.session_state.conversations.append({
            "id": st.session_state.current_chat_id,
            "title": st.session_state.chat_title,
            "messages": st.session_state.chat_messages,
            "timestamp": datetime.now().isoformat()
        })
    
    # Save to file
    save_to_file(st.session_state.conversations, CONVERSATIONS_FILE)

# Navigation pages
pages = ["Chat", "Daily Journal"]
page = st.sidebar.radio("Navigation", pages)

# Sidebar for chat history and settings
with st.sidebar:
    st.title("Memory-Enabled Assistant")
    
    # New chat button
    if st.button("+ New Chat", use_container_width=True):
        create_new_chat()
    
    st.divider()
    
    # Display past conversations
    st.subheader("Chat History")
    
    if st.session_state.conversations:
        # Sort conversations by timestamp, most recent first
        sorted_convs = sorted(
            st.session_state.conversations, 
            key=lambda x: x.get("timestamp", ""), 
            reverse=True
        )
        
        for conv in sorted_convs:
            # Create a title for the conversation
            if len(conv.get("messages", [])) > 0:
                title = conv.get("title", "") if conv.get("title") else conv["messages"][0][0][:30] + "..."
            else:
                title = "Empty Conversation"
                
            # Display as a button
            if st.button(title, key=f"chat_{conv['id']}", use_container_width=True):
                load_chat(conv['id'])
    else:
        st.info("No chat history yet.")
    
    st.divider()
    
    # User type selection
    st.subheader("User Settings")
    user_type = st.selectbox(
        "Select User Type:",
        ["Regular", "Specially Abled", "Personalized"],
        index=0 if st.session_state.settings["user_type"] == "Regular" else 
              1 if st.session_state.settings["user_type"] == "Specially Abled" else 2,
        key="user_type_select"
    )
    
    # Update settings if changed
    if user_type != st.session_state.settings["user_type"]:
        st.session_state.settings["user_type"] = user_type
        # Reset disability type if not specially abled
        if user_type != "Specially Abled":
            st.session_state.settings["disability_type"] = None
        
        # Save settings
        save_settings(st.session_state.settings)
    
    # Show additional options based on user type
    if user_type == "Specially Abled":
        disability_type = st.selectbox(
            "Select Disability Type:",
            list(disability_templates.keys()),
            index=list(disability_templates.keys()).index(st.session_state.settings["disability_type"]) 
                if st.session_state.settings["disability_type"] in disability_templates 
                else 0,
            key="disability_select"
        )
        
        if disability_type != st.session_state.settings["disability_type"]:
            st.session_state.settings["disability_type"] = disability_type
            st.session_state.settings["system_prompt"] = disability_templates[disability_type]
            save_settings(st.session_state.settings)
            
        # Allow editing the system prompt
        with st.expander("Edit System Prompt"):
            new_prompt = st.text_area(
                "Customize System Prompt:", 
                value=st.session_state.settings["system_prompt"],
                height=200
            )
            
            if st.button("Save System Prompt"):
                st.session_state.settings["system_prompt"] = new_prompt
                save_settings(st.session_state.settings)
                st.success("System prompt updated!")
    
    elif user_type == "Personalized":
        with st.expander("Personalize Assistant"):
            new_prompt = st.text_area(
                "Customize System Prompt:", 
                value=st.session_state.settings["system_prompt"],
                height=200
            )
            
            if st.button("Save System Prompt"):
                st.session_state.settings["system_prompt"] = new_prompt
                save_settings(st.session_state.settings)
                st.success("System prompt updated!")
    
    st.divider()
    
    # Delete all memories option
    st.subheader("Memory Management")
    if st.button("Delete All Memory", type="primary", use_container_width=True):
        st.session_state.show_delete_confirmation = True
    
    # Show confirmation dialog
    if st.session_state.get("show_delete_confirmation", False):
        st.warning("⚠️ Are you sure you want to delete all memories? This action cannot be undone.")
        col1, col2 = st.columns(2)
        with col1:
            if st.button("Yes, Delete All", key="confirm_delete"):
                # Delete all memory from LTMS
                if memory_handler.delete_all_memories():
                    # Clear conversations and journal entries
                    st.session_state.conversations = []
                    st.session_state.journal_entries = []
                    save_to_file([], CONVERSATIONS_FILE)
                    save_to_file([], JOURNAL_FILE)
                    st.session_state.show_delete_confirmation = False
                    st.success("All memories deleted successfully!")
                    st.rerun()
        
        with col2:
            if st.button("No, Cancel", key="cancel_delete"):
                st.session_state.show_delete_confirmation = False
                st.rerun()

# Main content area - change based on selected page
if page == "Chat":
    st.title("Chat with Assistant")
    
    # Display chat messages
    chat_container = st.container()
    with chat_container:
        for user_msg, ai_response in st.session_state.chat_messages:
            st.chat_message("user").write(user_msg)
            st.chat_message("assistant").write(ai_response)
    
    # Create columns for text input and image upload
    col1, col2 = st.columns([4, 1])
    
    with col1:
        # Chat input with less vertical space
        user_input = st.chat_input("Ask me anything...", key="chat_input")
    
    with col2:
        # Image upload button
        uploaded_file = st.file_uploader("Upload Image", type=["jpg", "jpeg", "png"], key="image_upload")
        if uploaded_file is not None:
            image = Image.open(uploaded_file)
            st.session_state.uploaded_image = image
            st.image(image, caption="Uploaded Image", use_column_width=True)
    
    if user_input:
        # Display user message
        st.chat_message("user").write(user_input)
        
        # Convert PIL Image to format suitable for Gemini if image was uploaded
        gemini_image = None
        if st.session_state.uploaded_image:
            gemini_image = st.session_state.uploaded_image
        
        # Generate and display AI response
        response = memory_handler.generate_response(user_input, st.session_state.current_chat_id, gemini_image)
        st.chat_message("assistant").write(response)
        
        # Store in chat messages
        st.session_state.chat_messages.append((user_input, response))
        
        # Update chat title if first message
        if len(st.session_state.chat_messages) == 1:
            st.session_state.chat_title = user_input[:30] + "..."
        
        # Save current chat
        save_current_chat()
        
        # Reset image upload
        st.session_state.uploaded_image = None
        
        # Force a rerun
        st.rerun()

elif page == "Daily Journal":
    st.title("Daily Journal")
    
    # Display current date
    today = datetime.now().strftime("%B %d, %Y")
    st.subheader(f"Journal Entry - {today}")
    
    # Add new journal entry
    new_entry = st.text_area("Add a new journal entry:", height=150, key="new_journal_entry")
    
    # Create columns for buttons
    col1, col2, col3 = st.columns([1, 1, 2])
    
    with col1:
        # Save button
        if st.button("Save Entry", use_container_width=True):
            if new_entry:
                # Create a unique ID for the entry
                entry_id = str(uuid.uuid4())
                
                # Add to memory and get timestamp
                _, timestamp = memory_handler.add_journal_entry(new_entry, entry_id)
                
                # Add to session state with more metadata
                entry_data = {
                    "id": entry_id,
                    "content": new_entry,
                    "date": datetime.now().strftime("%B %d, %Y"),
                    "time": datetime.now().strftime("%I:%M %p"),
                    "timestamp": timestamp,
                    "emotion_analysis": None  # Initialize with no analysis
                }
                
                # Add to journal entries and save
                st.session_state.journal_entries.append(entry_data)
                save_to_file(st.session_state.journal_entries, JOURNAL_FILE)
                
                st.success("Journal entry saved!")
                
                # Clear the input field
                st.session_state.new_journal_entry = ""
                
                # Force a rerun
                st.rerun()
            else:
                st.error("Please enter some text for your journal entry.")
    
    with col2:
        # Analyze button (only analyzes without saving)
        if st.button("Analyze", use_container_width=True):
            if new_entry:
                # Perform emotion analysis without saving
                emotion_analysis = memory_handler.analyze_emotion(new_entry)
                
                # Store in session state temporarily for display
                if "temp_analysis" not in st.session_state:
                    st.session_state.temp_analysis = {}
                
                st.session_state.temp_analysis["latest"] = emotion_analysis
                
                # Force a rerun to display analysis
                st.rerun()
            else:
                st.error("Please enter some text to analyze.")
    
    # Display temporary analysis if it exists
    if "temp_analysis" in st.session_state and "latest" in st.session_state.temp_analysis:
        st.markdown("### Emotion Analysis (Not Saved)")
        st.markdown(f"*{st.session_state.temp_analysis['latest']}*")
        st.markdown("---")
        
        # Add a Save with Analysis button
        if st.button("Save Entry with Analysis"):
            if new_entry:
                # Create a unique ID for the entry
                entry_id = str(uuid.uuid4())
                
                # Add to memory and get timestamp
                _, timestamp = memory_handler.add_journal_entry(new_entry, entry_id)
                
                # Add to session state with more metadata
                entry_data = {
                    "id": entry_id,
                    "content": new_entry,
                    "date": datetime.now().strftime("%B %d, %Y"),
                    "time": datetime.now().strftime("%I:%M %p"),
                    "timestamp": timestamp,
                    "emotion_analysis": st.session_state.temp_analysis["latest"]
                }
                
                # Add to journal entries and save
                st.session_state.journal_entries.append(entry_data)
                save_to_file(st.session_state.journal_entries, JOURNAL_FILE)
                
                st.success("Journal entry saved with emotion analysis!")
                
                # Clear the input field and temp analysis
                st.session_state.new_journal_entry = ""
                st.session_state.temp_analysis = {}
                
                # Force a rerun
                st.rerun()
    
    st.divider()
    
    # Display journal entries grouped by date
    if st.session_state.journal_entries:
        st.subheader("Journal History")
        
        # Add button to collapse/expand all entries
        toggle_all_key = "toggle_all_entries"
        if st.button("Collapse All" if st.session_state.expanded_entries else "Expand All", key=toggle_all_key):
            if st.session_state.expanded_entries:
                st.session_state.expanded_entries = set()  # Collapse all
            else:
                # Get all entry IDs and expand them
                all_ids = [entry["id"] for entry in st.session_state.journal_entries]
                st.session_state.expanded_entries = set(all_ids)
            st.rerun()
        
        # Convert journal entries to dataframe for easier manipulation
        df = pd.DataFrame(st.session_state.journal_entries)
        
        # Add date column if not present (for backwards compatibility)
        if "date" not in df.columns:
            df["date"] = pd.to_datetime(df["timestamp"]).dt.strftime("%B %d, %Y")
        
        # Get unique dates
        dates = df["date"].unique()
        
        # Display entries by date (most recent first)
        for date in sorted(dates, reverse=True):
            date_entries = df[df["date"] == date]
            
            with st.expander(f"Entries for {date}", expanded=(date == today)):
                for _, entry in date_entries.iterrows():
                    entry_id = entry["id"]
                    is_expanded = entry_id in st.session_state.expanded_entries
                    
                    # Create columns for entry header and controls
                    col1, col2, col3 = st.columns([3, 1, 1])
                    
                    with col1:
                        st.write(f"### Entry at {entry.get('time', '(no time)')}")
                    
                    with col2:
                        # Toggle button for individual entry
                        toggle_button_label = "Minimize" if is_expanded else "Expand"
                        if st.button(toggle_button_label, key=f"toggle_{entry_id}"):
                            toggle_entry_expansion(entry_id)
                            st.rerun()
                    
                    with col3:
                        # Delete button with confirmation
                        if st.button("🗑️ Delete", key=f"delete_btn_{entry_id}"):
                            st.session_state[f"confirm_delete_{entry_id}"] = True
                    
                    # Show delete confirmation if needed
                    if st.session_state.get(f"confirm_delete_{entry_id}", False):
                        st.warning("⚠️ Are you sure you want to delete this entry? This cannot be undone.")
                        col1, col2 = st.columns(2)
                        with col1:
                            if st.button("Yes, Delete", key=f"confirm_yes_{entry_id}"):
                                delete_journal_entry(entry_id)
                        with col2:
                            if st.button("No, Cancel", key=f"confirm_no_{entry_id}"):
                                st.session_state[f"confirm_delete_{entry_id}"] = False
                                st.rerun()
                    
                    # Show entry content if expanded
                    if is_expanded:
                        # Display editable text area
                        edited_entry = st.text_area(
                            "Entry content:", 
                            value=entry["content"], 
                            height=100, 
                            key=f"journal_{entry_id}"
                        )
                        
                        # Create columns for buttons
                        col1, col2 = st.columns([1, 1])
                        
                        with col1:
                            # Update button
                            if st.button("Update Entry", key=f"update_{entry_id}"):
                                if edited_entry != entry["content"]:
                                    # Update memory
                                    memory_handler.add_journal_entry(edited_entry, entry["id"])
                                    
                                    # Find and update the entry in session state
                                    for i, journal_entry in enumerate(st.session_state.journal_entries):
                                        if journal_entry["id"] == entry["id"]:
                                            st.session_state.journal_entries[i]["content"] = edited_entry
                                            st.session_state.journal_entries[i]["last_edited"] = datetime.now().isoformat()
                                            break
                                    
                                    # Save to file
                                    save_to_file(st.session_state.journal_entries, JOURNAL_FILE)
                                    st.success("Journal entry updated!")
                                    st.rerun()
                        
                        with col2:
                            # Analyze Emotion button - only analyzes, doesn't save
                            if st.button("Analyze Emotion", key=f"analyze_{entry_id}"):
                                emotion_analysis = memory_handler.analyze_emotion(edited_entry)
                                
                                # Store in session state temporarily for display
                                if "entry_analysis" not in st.session_state:
                                    st.session_state.entry_analysis = {}
                                
                                st.session_state.entry_analysis[entry["id"]] = emotion_analysis
                                
                                # Mark this entry as having been analyzed
                                if "analyzed_entries" not in st.session_state:
                                    st.session_state.analyzed_entries = set()
                                
                                st.session_state.analyzed_entries.add(entry["id"])
                                
                                st.rerun()
                                
                        # Display emotion analysis if it exists in entry or temporary analysis
                        if entry.get("emotion_analysis"):
                            st.markdown("#### 🧠 Saved Emotion Analysis")
                            st.markdown(f"*{entry['emotion_analysis']}*")
                        
                        # Display temporary analysis if it exists
                        if "entry_analysis" in st.session_state and entry["id"] in st.session_state.entry_analysis:
                            st.markdown("#### 🔍 Current Emotion Analysis (Not Saved)")
                            st.markdown(f"*{st.session_state.entry_analysis[entry['id']]}*")
                            
                            # Add a button to save this analysis
                            if st.button("Save This Analysis", key=f"save_analysis_{entry['id']}"):
                                # Find and update the entry in session state
                                for i, journal_entry in enumerate(st.session_state.journal_entries):
                                    if journal_entry["id"] == entry["id"]:
                                        st.session_state.journal_entries[i]["emotion_analysis"] = st.session_state.entry_analysis[entry["id"]]
                                        break
                                
                                # Save to file
                                save_to_file(st.session_state.journal_entries, JOURNAL_FILE)
                                
                                # Remove from temporary storage
                                del st.session_state.entry_analysis[entry["id"]]
                                
                                st.success("Emotion analysis saved!")
                                st.rerun()
                    else:
                        # If minimized, show a preview of the content
                        st.markdown(f"*Preview: {entry['content'][:100]}{'...' if len(entry['content']) > 100 else ''}*")
                    
                    st.divider()
    else:
        st.info("No journal entries yet. Add your first entry above!")