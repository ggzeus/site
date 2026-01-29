import sys
import os
import json
import sqlite3
import requests
from flask import Flask, request, jsonify
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from bs4 import BeautifulSoup

app = Flask(__name__)

# --- CONFIGURATION ---
DB_PATH = os.path.join(os.getcwd(), 'scarlet.db')

# --- KNOWLEDGE BASE ---
# We will load this from SQLite on startup
knowledge_base = []
vectorizer = None
tfidf_matrix = None

def load_knowledge_base():
    global knowledge_base, vectorizer, tfidf_matrix
    
    kb = []
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Load Products
        cursor.execute("SELECT name, description, type FROM products")
        for row in cursor.fetchall():
            kb.append({
                "text": f"{row[0]} {row[1]} {row[2]}",
                "response": f"Encontrei o produto **{row[0]}** ({row[2]}). Ele é ótimo para isso. Veja na loja!",
                "source": "product"
            })
            
        # 2. Load Learned Memories
        cursor.execute("SELECT term, definition FROM ai_memory")
        for row in cursor.fetchall():
            kb.append({
                "text": f"{row[0]}", # The term is the key
                "response": f"Aprendi que **{row[0]}** significa: _{row[1]}_.",
                "source": "memory"
            })
            
        conn.close()
    except Exception as e:
        print(f"Error loading DB: {e}")

    # 3. Hardcoded Fallbacks / Common Chit-Chat
    kb.append({"text": "oi olá hello hi eai", "response": "Olá! Sou a IA Avançada da Scarlet (Python Brain). Como posso ajudar?", "source": "chitchat"})
    kb.append({"text": "quem é você", "response": "Sou uma inteligência artificial baseada em Redes Neurais (TF-IDF) rodando em Python.", "source": "chitchat"})
    kb.append({"text": "ajuda help socorro", "response": "Posso ajudar com produtos, erros de instalação ou pesquisar na internet.", "source": "chitchat"})
    
    knowledge_base = kb
    
    # Train Vectorizer
    if kb:
        corpus = [item['text'] for item in kb]
        vectorizer = TfidfVectorizer().fit(corpus)
        tfidf_matrix = vectorizer.transform(corpus)
        print(f"✅ AI Brain Loaded: {len(kb)} items.")
    else:
        print("⚠️ AI Brain Empty.")

# --- SEARCH LOGIC ---

def search_internal(query):
    if not vectorizer or not knowledge_base:
        return None
        
    query_vec = vectorizer.transform([query])
    similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()
    
    best_idx = similarities.argmax()
    best_score = similarities[best_idx]
    
    print(f"🔍 Internal Search: '{query}' -> Match: {best_score:.2f}")
    
    if best_score > 0.2: # Confidence Threshold
        return knowledge_base[best_idx]['response']
    return None

def search_internet(query):
    print(f"🌐 Searching Internet for: {query}")
    try:
        # Using DuckDuckGo HTML (No API Key needed for simple scrape)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        url = f"https://html.duckduckgo.com/html/?q={query}"
        
        res = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        results = []
        for result in soup.find_all('a', class_='result__a', limit=3):
            title = result.get_text()
            link = result['href']
            results.append(f"- [{title}]({link})")
            
        if results:
            return f"Não encontrei no meu banco de dados, mas pesquisei online:\n\n" + "\n".join(results)
        else:
            return "Pesquisei na internet mas não encontrei nada relevante."
            
    except Exception as e:
        return f"Tentei pesquisar online, mas falhei: {str(e)}"

# --- ROUTES ---

@app.route('/reload', methods=['POST'])
def reload_kb():
    load_knowledge_base()
    return jsonify({"status": "reloaded"})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    
    if not message:
        return jsonify({"response": "..."})

    # 1. Try Internal Knowledge Base (Semantic Search)
    internal_response = search_internal(message)
    if internal_response:
        return jsonify({"response": internal_response})

    # 2. If low confidence, Try Internet Search
    # Only search if it looks like a question or search query
    if len(message.split()) > 2:
        internet_response = search_internet(message)
        return jsonify({"response": internet_response})

    # 3. Fallback
    return jsonify({"response": "Desculpe, não entendi. Tente ser mais específico."})

if __name__ == '__main__':
    load_knowledge_base()
    app.run(port=5000, debug=False)
