# Solac AI — Memory-Enabled Assistant  

Solac AI is a full-stack, multimodal AI assistant that leverages a custom **Long-Term Memory System (LTMS)** for retaining user context across sessions. It supports intelligent journaling, contextual chat, emotion analysis, and adaptive behavior for specially-abled users.
This project was developed under 24 hours during a hackathon, led by me, with full-stack development, API design, vector memory, and frontend UI all built from scratch

> **LTMS Repo**: [github.com/arawind-s/LongTermMemorySystem](https://github.com/arawind-s/LongTermMemorySystem)

---

## Features

- **Custom LTMS (Long-Term Memory System)**  
  Used my own memory system built with SentenceTransformers + ChromaDB to persist and retrieve past user context and journal history.  
  [See full LTMS project →](https://github.com/arawind-s/LongTermMemorySystem)

- **Specially Prompt Engineered**  
  Crafted structured, markdown-friendly prompts for:
  - Memory recall
  - Contextual conversation
  - Accessibility support

- **Emotion-Aware Journal Module**  
  - Write and manage journal entries  
  - Analyze mood using Gemini API  
  - Edit or delete anytime

- **Image-Enhanced Interaction**  
  - Upload images (base64 encoded)  
  - Gemini 2.0 describes and integrates image content into conversation

- **Modern Frontend Dashboard**  
  - HTML/CSS/JS interface  
  - Markdown-rendered responses  
  - Dark mode, sidebar toggle, multi-section layout

---

## Tech Stack

**Frontend**
- HTML5
- CSS
- -JavaScript

**Backend**
- FastAPI + Python
- Google Gemini 2.0 Flash API
- Sentence Transformers
- vector database

---
