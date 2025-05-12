document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const languageButtons = document.querySelectorAll('.lang-btn');
    const textModeBtn = document.getElementById('text-mode-btn');
    const voiceModeBtn = document.getElementById('voice-mode-btn');
    const tutorButtons = document.querySelectorAll('.tutor-btn');
    const installBtn = document.getElementById('install-btn');
    
    let userName = "";
    let isAskingName = true;
    let conversationHistory = [];
    let currentLanguage = "en";
    let isVoiceMode = false;
    let isRecording = false;
    let recognition = null;
    let audioCache = {};
    let deferredPrompt = null;
    let isExternalServer = false;
    let aiProvider = null;
    
    class AIProviders {
        constructor() {
            this.providers = {
                websim: {
                    name: 'websim',
                    available: false,
                    chat: this.websimChat.bind(this),
                    tts: this.websimTTS.bind(this)
                },
                openai: {
                    name: 'openai',
                    available: false,
                    apiKey: '',
                    chat: this.openaiChat.bind(this),
                    tts: null  
                },
                browser: {
                    name: 'browser',
                    available: !!window.speechSynthesis,
                    chat: null, 
                    tts: this.browserTTS.bind(this)
                },
                fallback: {
                    name: 'fallback',
                    available: true,
                    chat: this.fallbackChat.bind(this),
                    tts: this.fallbackTTS.bind(this)
                }
            };
            
            this.initProviders();
        }
        
        async initProviders() {
            try {
                if (typeof websim !== 'undefined') {
                    this.providers.websim.available = true;
                    console.log('Websim API available');
                }
            } catch (e) {
                console.log('Websim API not available');
            }
            
            const openaiKey = localStorage.getItem('openai_api_key');
            if (openaiKey) {
                this.providers.openai.apiKey = openaiKey;
                this.providers.openai.available = true;
                console.log('OpenAI API key found');
            }
            
            if (this.providers.websim.available) {
                this.primaryProvider = 'websim';
            } else if (this.providers.openai.available) {
                this.primaryProvider = 'openai';
            } else {
                this.primaryProvider = 'fallback';
                this.promptForAPIKey();
            }
            
            if (this.providers.websim.available) {
                this.ttsProvider = 'websim';
            } else if (this.providers.browser.available) {
                this.ttsProvider = 'browser';
            } else {
                this.ttsProvider = 'fallback';
            }
            
            console.log(`Using AI provider: ${this.primaryProvider}`);
            console.log(`Using TTS provider: ${this.ttsProvider}`);
        }
        
        promptForAPIKey() {
            if (sessionStorage.getItem('api_key_prompted')) return;
            
            setTimeout(() => {
                const apiKey = prompt("To enable AI features, you can enter an OpenAI API key. Leave blank to use simplified responses.");
                if (apiKey && apiKey.trim().startsWith('sk-')) {
                    localStorage.setItem('openai_api_key', apiKey.trim());
                    this.providers.openai.apiKey = apiKey.trim();
                    this.providers.openai.available = true;
                    this.primaryProvider = 'openai';
                    alert("API key saved! Refresh the page to use enhanced AI features.");
                }
                sessionStorage.setItem('api_key_prompted', 'true');
            }, 2000);
        }
        
        async chat(messages) {
            try {
                return await this.providers[this.primaryProvider].chat(messages);
            } catch (error) {
                console.error(`Error with ${this.primaryProvider} chat:`, error);
                return await this.providers.fallback.chat(messages);
            }
        }
        
        async tts(text, voice) {
            try {
                return await this.providers[this.ttsProvider].tts(text, voice);
            } catch (error) {
                console.error(`Error with ${this.ttsProvider} TTS:`, error);
                if (this.ttsProvider !== 'browser' && this.providers.browser.available) {
                    return await this.providers.browser.tts(text, voice);
                }
                return null;
            }
        }
        
        async websimChat(messages) {
            const completion = await websim.chat.completions.create({
                messages: messages,
                json: true
            });
            
            try {
                return JSON.parse(completion.content);
            } catch (error) {
                return {
                    response: completion.content || "I couldn't generate a proper response.",
                    corrections: []
                };
            }
        }
        
        async websimTTS(text, voice) {
            const result = await websim.textToSpeech({
                text: text,
                voice: voice
            });
            
            return {
                url: result.url,
                audio: new Audio(result.url)
            };
        }
        
        async openaiChat(messages) {
            const formattedMessages = messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.providers.openai.apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-3.5-turbo',
                        messages: formattedMessages,
                        temperature: 0.7
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.status}`);
                }
                
                const data = await response.json();
                const content = data.choices[0].message.content;
                
                try {
                    return JSON.parse(content);
                } catch (error) {
                    return {
                        response: content,
                        corrections: []
                    };
                }
            } catch (error) {
                console.error('OpenAI API error:', error);
                throw error;
            }
        }
        
        async browserTTS(text, voice) {
            return new Promise((resolve, reject) => {
                if (!window.speechSynthesis) {
                    reject('Browser speech synthesis not available');
                    return;
                }
                
                const voiceParts = voice.split('-');
                const langCode = voiceParts[0];
                const voiceGender = voiceParts[1] || 'female';
                
                const langMap = {
                    'en': 'en-US',
                    'es': 'es-ES',
                    'fr': 'fr-FR',
                    'it': 'it-IT',
                    'zh': 'zh-CN'
                };
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = langMap[langCode] || 'en-US';
                
                let voices = window.speechSynthesis.getVoices();
                if (voices.length === 0) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        voices = window.speechSynthesis.getVoices();
                        setVoice();
                    };
                } else {
                    setVoice();
                }
                
                function setVoice() {
                    const langVoices = voices.filter(v => 
                        v.lang.startsWith(langCode) || v.lang.startsWith(langMap[langCode]));
                    
                    if (langVoices.length > 0) {
                        const genderMatch = voiceGender === 'female' ? 
                            langVoices.find(v => v.name.includes('Female') || v.name.includes('female')) :
                            langVoices.find(v => v.name.includes('Male') || v.name.includes('male'));
                        
                        utterance.voice = genderMatch || langVoices[0];
                    }
                    
                    window.speechSynthesis.speak(utterance);
                    
                    const dummyAudio = {
                        play: () => {
                            window.speechSynthesis.speak(utterance);
                        },
                        pause: () => {
                            window.speechSynthesis.pause();
                        },
                        cancel: () => {
                            window.speechSynthesis.cancel();
                        }
                    };
                    
                    resolve({
                        url: null,
                        audio: dummyAudio
                    });
                }
                
                utterance.onerror = (event) => {
                    reject(`Speech synthesis error: ${event.error}`);
                };
            });
        }
        
        async fallbackChat(messages) {
            const userMessage = messages.find(msg => msg.role === 'user');
            let userContent = '';
            
            if (userMessage) {
                userContent = userMessage.content;
            }
            
            const systemMessage = messages.find(msg => msg.role === 'system');
            let currentLang = 'en';
            
            if (systemMessage && systemMessage.content) {
                if (systemMessage.content.includes('Spanish')) currentLang = 'es';
                else if (systemMessage.content.includes('French')) currentLang = 'fr';
                else if (systemMessage.content.includes('Italian')) currentLang = 'it';
                else if (systemMessage.content.includes('Chinese')) currentLang = 'zh';
            }
            
            const responses = {
                en: [
                    "Hello! How are you today?",
                    "That's interesting! Tell me more.",
                    "I understand. What else would you like to talk about?",
                    "Can you explain that in a different way?",
                    "Let's discuss something else. What are your hobbies?",
                    "Do you enjoy learning languages?",
                    "What's your favorite thing about learning English?",
                    "That's great practice! Keep going!"
                ],
                es: [
                    "¡Hola! ¿Cómo estás hoy?",
                    "¡Qué interesante! Cuéntame más.",
                    "Entiendo. ¿De qué más te gustaría hablar?",
                    "¿Puedes explicarlo de otra manera?",
                    "Hablemos de otra cosa. ¿Cuáles son tus pasatiempos?",
                    "¿Te gusta aprender idiomas?",
                    "¿Qué es lo que más te gusta de aprender español?",
                    "¡Esa es una buena práctica! ¡Continúa!"
                ],
                fr: [
                    "Bonjour ! Comment vas-tu aujourd'hui ?",
                    "C'est intéressant ! Dis-m'en plus.",
                    "Je comprends. De quoi d'autre aimerais-tu parler ?",
                    "Peux-tu l'expliquer d'une manière différente ?",
                    "Parlons d'autre chose. Quels sont tes passe-temps ?",
                    "Aimes-tu apprendre des langues ?",
                    "Qu'est-ce que tu préfères dans l'apprentissage du français ?",
                    "C'est une bonne pratique ! Continue !"
                ],
                it: [
                    "Ciao! Come stai oggi?",
                    "Interessante! Dimmi di più.",
                    "Capisco. Di cos'altro vorresti parlare?",
                    "Puoi spiegarlo in un altro modo?",
                    "Parliamo di qualcos'altro. Quali sono i tuoi hobby?",
                    "Ti piace imparare le lingue?",
                    "Qual è la cosa che ti piace di più dell'imparare l'italiano?",
                    "È un buon esercizio! Continua così!"
                ],
                zh: [
                    "你好！今天怎么样？",
                    "真有趣！请告诉我更多。",
                    "我明白了。你还想谈些什么？",
                    "你能用不同的方式解释一下吗？",
                    "让我们谈谈别的。你有什么爱好？",
                    "你喜欢学习语言吗？",
                    "你最喜欢学习中文的什么？",
                    "这是很好的练习！继续吧！"
                ]
            };
            
            if (userContent.match(/hello|hi|hey|good morning|good afternoon|good evening/i) ||
                userContent.match(/hola|buenos días|buenas tardes|buenas noches/i) ||
                userContent.match(/bonjour|salut|bonsoir/i) ||
                userContent.match(/ciao|buongiorno|buonasera/i) ||
                userContent.match(/你好|早上好|下午好|晚上好/i)) {
                return {
                    response: responses[currentLang][0],
                    corrections: []
                };
            }
            
            const randomIndex = Math.floor(Math.random() * (responses[currentLang].length - 1)) + 1;
            return {
                response: responses[currentLang][randomIndex],
                corrections: []
            };
        }
        
        async fallbackTTS(text, voice) {
            console.log('No TTS available, skipping audio');
            return null;
        }
    }
    
    const aiAPI = new AIProviders();
    
    try {
        isExternalServer = typeof websim === 'undefined';
    } catch (e) {
        isExternalServer = true;
        console.log('Running on external server without websim API');
    }
    
    const isPWA = () => {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true;
    };
    
    if (isPWA()) {
        sessionStorage.setItem('pwaMode', 'true');
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_PWA_MODE'
            });
        }
    }
    
    let currentTutor = {
        id: "marcio",
        name: "Márcio",
        gender: "male",
        avatarSrc: "marcio_tutor.png"
    };
    
    const tutors = {
        marcio: {
            id: "marcio",
            name: "Márcio",
            gender: "male",
            avatarSrc: "marcio_tutor.png"
        },
        nathalia: {
            id: "nathalia",
            name: "Nathalia",
            gender: "female",
            avatarSrc: "nathalia_tutor.png"
        }
    };

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block';
        console.log('Installation prompt detected and saved');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            alert('To install this app on iOS: tap the share button and then "Add to Home Screen"');
            return;
        }
        
        deferredPrompt.prompt();
        
        try {
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Installation outcome: ${outcome}`);
            
            if (outcome === 'accepted') {
                console.log('App was installed');
                sessionStorage.setItem('installAccepted', 'true');
            }
        } catch (error) {
            console.error('Error during installation:', error);
        }
        
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });

    function initSpeechRecognition() {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            try {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                
                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    userInput.value = transcript;
                    stopRecording();
                    sendMessage();
                };
                
                recognition.onerror = (event) => {
                    console.error('Speech recognition error', event.error);
                    stopRecording();
                    
                    if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                        alert('Please allow microphone access to use voice input.');
                    } else if (event.error === 'network') {
                        alert('Network error occurred. Please check your connection.');
                    }
                };
                
                recognition.onend = () => {
                    stopRecording();
                };
            } catch (error) {
                console.error('Error initializing speech recognition:', error);
                voiceModeBtn.disabled = true;
            }
        } else {
            console.log('Speech recognition not supported in this browser');
            voiceModeBtn.disabled = true;
            voiceModeBtn.style.display = 'none';
        }
    }
    
    function startRecording() {
        if (!recognition) return;
        
        try {
            recognition.lang = getSpeechRecognitionLanguage();
            recognition.start();
            isRecording = true;
            micBtn.classList.add('recording');
        } catch (error) {
            console.error('Speech recognition error', error);
        }
    }
    
    function stopRecording() {
        if (!recognition) return;
        
        try {
            recognition.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
        } catch (error) {
            console.error('Speech recognition error', error);
        }
    }
    
    function getSpeechRecognitionLanguage() {
        const langMap = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'it': 'it-IT',
            'zh': 'zh-CN'
        };
        return langMap[currentLanguage] || 'en-US';
    }
    
    function getTTSVoice() {
        return `${currentLanguage}-${currentTutor.gender}`;
    }
    
    async function playBotAudio(text) {
        const cacheKey = `${currentLanguage}-${currentTutor.gender}-${text}`;
        
        try {
            let audioResult;
            
            if (audioCache[cacheKey]) {
                if (audioCache[cacheKey].audio) {
                    audioCache[cacheKey].audio.play();
                    return audioCache[cacheKey].audio;
                } else {
                    const audio = new Audio(audioCache[cacheKey].url);
                    audio.play();
                    audioCache[cacheKey].audio = audio;
                    return audio;
                }
            } else {
                audioResult = await aiAPI.tts(text, getTTSVoice());
                
                if (!audioResult) return null;
                
                audioCache[cacheKey] = audioResult;
                
                if (audioResult.audio) {
                    audioResult.audio.play();
                    return audioResult.audio;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Text-to-speech error', error);
            return null;
        }
    }
    
    const languageConfig = {
        en: {
            name: "English",
            greeting: (tutorName) => `Hello! My name is ${tutorName}. Let's practice English together! What's your name?`,
            namePrompt: "What's your name?",
            sendBtn: "Send",
            typingText: "Typing...",
            inputPlaceholder: "Type your message here...",
            voiceInputPlaceholder: "Click the microphone to speak...",
            fallbackResponses: [
                "Hello! How are you today?",
                "That's interesting! Tell me more.",
                "I understand. What else would you like to talk about?",
                "Can you explain that in a different way?",
                "Let's discuss something else. What are your hobbies?",
                "Do you enjoy learning languages?",
                "What's your favorite thing about learning English?",
                "That's great practice! Keep going!"
            ]
        },
        es: {
            name: "Spanish",
            greeting: (tutorName) => `¡Hola! Mi nombre es ${tutorName}. ¡Practiquemos español juntos! ¿Cómo te llamas?`,
            namePrompt: "¿Cómo te llamas?",
            sendBtn: "Enviar",
            typingText: "Escribiendo...",
            inputPlaceholder: "Escribe tu mensaje aquí...",
            voiceInputPlaceholder: "Haz clic en el micrófono para hablar...",
            fallbackResponses: [
                "¡Hola! ¿Cómo estás hoy?",
                "¡Qué interesante! Cuéntame más.",
                "Entiendo. ¿De qué más te gustaría hablar?",
                "¿Puedes explicarlo de otra manera?",
                "Hablemos de otra cosa. ¿Cuáles son tus pasatiempos?",
                "¿Te gusta aprender idiomas?",
                "¿Qué es lo que más te gusta de aprender español?",
                "¡Esa es una buena práctica! ¡Continúa!"
            ]
        },
        fr: {
            name: "French",
            greeting: (tutorName) => `Bonjour ! Je m'appelle ${tutorName}. Pratiquons le français ensemble ! Comment t'appelles-tu ?`,
            namePrompt: "Comment t'appelles-tu ?",
            sendBtn: "Envoyer",
            typingText: "En train d'écrire...",
            inputPlaceholder: "Écrivez votre message ici...",
            voiceInputPlaceholder: "Cliquez sur le microphone pour parler...",
            fallbackResponses: [
                "Bonjour ! Comment vas-tu aujourd'hui ?",
                "C'est intéressant ! Dis-m'en plus.",
                "Je comprends. De quoi d'autre aimerais-tu parler ?",
                "Peux-tu l'expliquer d'une manière différente ?",
                "Parlons d'autre chose. Quels sont tes passe-temps ?",
                "Aimes-tu apprendre des langues ?",
                "Qu'est-ce que tu préfères dans l'apprentissage du français ?",
                "C'est une bonne pratique ! Continue !"
            ]
        },
        it: {
            name: "Italian",
            greeting: (tutorName) => `Ciao! Mi chiamo ${tutorName}. Pratichiamo l'italiano insieme! Come ti chiami?`,
            namePrompt: "Come ti chiami?",
            sendBtn: "Invia",
            typingText: "Digitando...",
            inputPlaceholder: "Scrivi il tuo messaggio qui...",
            voiceInputPlaceholder: "Clicca sul microfono per parlare...",
            fallbackResponses: [
                "Ciao! Come stai oggi?",
                "Interessante! Dimmi di più.",
                "Capisco. Di cos'altro vorresti parlare?",
                "Puoi spiegarlo in un altro modo?",
                "Parliamo di qualcos'altro. Quali sono i tuoi hobby?",
                "Ti piace imparare le lingue?",
                "Qual è la cosa che ti piace di più dell'imparare l'italiano?",
                "È un buon esercizio! Continua così!"
            ]
        },
        zh: {
            name: "Chinese",
            greeting: (tutorName) => `你好！我是 ${tutorName}。让我们一起练习中文吧！你叫什么名字？`,
            namePrompt: "你叫什么名字？",
            sendBtn: "发送",
            typingText: "正在输入...",
            inputPlaceholder: "在这里输入您的消息...",
            voiceInputPlaceholder: "点击麦克风说话...",
            fallbackResponses: [
                "你好！今天怎么样？",
                "真有趣！请告诉我更多。",
                "我明白了。你还想谈些什么？",
                "你能用不同的方式解释一下吗？",
                "让我们谈谈别的。你有什么爱好？",
                "你喜欢学习语言吗？",
                "你最喜欢学习中文的什么？",
                "这是很好的练习！继续吧！"
            ]
        }
    };

    function initializeSystemPrompt() {
        const langName = languageConfig[currentLanguage].name;
        return {
            role: "system",
            content: `You are ${currentTutor.name}, a friendly AI ${langName} tutor designed to help users practice 
            ${langName} conversation. You should:
            1. Maintain friendly, engaging conversations in ${langName}
            2. Identify and correct ${langName} grammar and spelling errors
            3. Provide explanations for corrections in a helpful, not critical way
            4. Keep responses concise (1-3 sentences)
            5. If you don't see any errors, just continue the conversation naturally
            6. For each error, provide the full corrected sentence, not just the corrected word/phrase
            
            Always respond with JSON in this format:
            {
              "response": "Your conversational response here",
              "corrections": [
                {
                  "error": "incorrect word/phrase", 
                  "correction": "correct word/phrase", 
                  "explanation": "brief explanation",
                  "correctedSentence": "The full sentence with the correction applied"
                }
              ]
            }
            
            If there are no errors, return an empty array for corrections.
            VERY IMPORTANT: Always respond in ${langName} only.`
        };
    }

    function addMessage(text, isUser, corrections = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;

        if (!isUser) {
            const botAvatar = document.createElement('img');
            botAvatar.src = currentTutor.avatarSrc;
            botAvatar.alt = currentTutor.name;
            botAvatar.className = 'bot-avatar';
            messageDiv.appendChild(botAvatar);
        }

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = text;
        messageDiv.appendChild(messageContent);

        if (!isUser) {
            const audioControls = document.createElement('div');
            audioControls.className = 'audio-controls';
            
            const playButton = document.createElement('button');
            playButton.className = 'audio-btn';
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.title = 'Play message';
            playButton.addEventListener('click', () => {
                playButton.disabled = true;
                playButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                playBotAudio(text)
                    .then(() => {
                        setTimeout(() => {
                            playButton.disabled = false;
                            playButton.innerHTML = '<i class="fas fa-play"></i>';
                        }, 500);
                    })
                    .catch(() => {
                        playButton.disabled = false;
                        playButton.innerHTML = '<i class="fas fa-play"></i>';
                    });
            });
            
            audioControls.appendChild(playButton);
            messageContent.appendChild(audioControls);
            
            if (isVoiceMode) {
                setTimeout(() => {
                    playButton.click();
                }, 500);
            }
        }

        if (corrections && corrections.length > 0) {
            const correctionDiv = document.createElement('div');
            correctionDiv.className = 'correction';
            
            const correctionTitle = document.createElement('div');
            correctionTitle.className = 'correction-title';
            correctionTitle.textContent = 'Corrections:';
            correctionDiv.appendChild(correctionTitle);
            
            const correctionList = document.createElement('ul');
            correctionList.className = 'correction-list';
            
            corrections.forEach(correction => {
                const correctionItem = document.createElement('li');
                
                correctionItem.textContent = `"${correction.error}" should be "${correction.correction}" - ${correction.explanation}`;
                correctionList.appendChild(correctionItem);
                
                if (correction.correctedSentence) {
                    const correctedSentenceDiv = document.createElement('div');
                    correctedSentenceDiv.className = 'corrected-sentence';
                    correctedSentenceDiv.textContent = `Corrected sentence: "${correction.correctedSentence}"`;
                    correctionItem.appendChild(correctedSentenceDiv);
                }
            });
            
            correctionDiv.appendChild(correctionList);
            messageDiv.appendChild(correctionDiv);
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function generateAIResponse(userText) {
        try {
            conversationHistory.push({
                role: "user",
                content: userText
            });
            
            if (conversationHistory.length > 12) { 
                conversationHistory = [
                    conversationHistory[0], 
                    ...conversationHistory.slice(-11) 
                ];
            }
            
            const result = await aiAPI.chat(conversationHistory);
            
            conversationHistory.push({
                role: "assistant",
                content: JSON.stringify(result)
            });
            
            return result;
        } catch (error) {
            console.error("Error generating AI response:", error);
            return {
                response: "I'm sorry, I encountered an error. Let's continue our conversation.",
                corrections: []
            };
        }
    }

    async function handleNameResponse(name) {
        userName = name.trim();
        
        conversationHistory.push({
            role: "system",
            content: `The user's name is ${userName}. Greet them warmly in ${languageConfig[currentLanguage].name} and suggest a topic to discuss.`
        });
        
        const result = await generateAIResponse("My name is " + userName);
        
        addMessage(result.response, false, result.corrections);
        isAskingName = false;
    }

    async function botResponse(userText) {
        if (isAskingName) {
            await handleNameResponse(userText);
            return;
        }
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        const botAvatar = document.createElement('img');
        botAvatar.src = currentTutor.avatarSrc;
        botAvatar.alt = currentTutor.name;
        botAvatar.className = 'bot-avatar';
        typingDiv.appendChild(botAvatar);
        
        const typingContent = document.createElement('div');
        typingContent.className = 'message-content';
        typingContent.textContent = languageConfig[currentLanguage].typingText;
        typingDiv.appendChild(typingContent);
        
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        try {
            const result = await generateAIResponse(userText);
            
            chatMessages.removeChild(typingDiv);
            
            addMessage(result.response, false, result.corrections);
        } catch (error) {
            chatMessages.removeChild(typingDiv);
            
            addMessage("I'm sorry, I couldn't process your message. Please try again.", false);
        }
    }

    function sendMessage() {
        const text = userInput.value.trim();
        if (text === '') return;
        
        addMessage(text, true);
        userInput.value = '';
        
        botResponse(text);
    }

    function toggleInputMode(mode) {
        isVoiceMode = mode === 'voice';
        
        if (isVoiceMode) {
            voiceModeBtn.classList.add('active');
            textModeBtn.classList.remove('active');
            micBtn.style.display = 'block';
            userInput.placeholder = languageConfig[currentLanguage].voiceInputPlaceholder;
        } else {
            textModeBtn.classList.add('active');
            voiceModeBtn.classList.remove('active');
            micBtn.style.display = 'none';
            userInput.placeholder = languageConfig[currentLanguage].inputPlaceholder;
        }
    }

    function changeTutor(tutorId) {
        if (currentTutor.id === tutorId) return;
        
        tutorButtons.forEach(btn => {
            if (btn.dataset.tutor === tutorId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        currentTutor = tutors[tutorId];
        
        resetConversation();
    }

    function changeLanguage(langCode) {
        if (currentLanguage === langCode) return;
        
        languageButtons.forEach(btn => {
            if (btn.dataset.lang === langCode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        currentLanguage = langCode;
        
        resetConversation();
    }

    function resetConversation() {
        sendBtn.textContent = languageConfig[currentLanguage].sendBtn;
        userInput.placeholder = isVoiceMode ? 
            languageConfig[currentLanguage].voiceInputPlaceholder : 
            languageConfig[currentLanguage].inputPlaceholder;
        
        chatMessages.innerHTML = '';
        isAskingName = true;
        userName = "";
        
        conversationHistory = [initializeSystemPrompt()];
        
        const greeting = languageConfig[currentLanguage].greeting(currentTutor.name);
        addMessage(greeting, false);
    }

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    micBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    
    textModeBtn.addEventListener('click', () => toggleInputMode('text'));
    voiceModeBtn.addEventListener('click', () => toggleInputMode('voice'));
    
    tutorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            changeTutor(btn.dataset.tutor);
        });
    });
    
    languageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            changeLanguage(btn.dataset.lang);
        });
    });
    
    initSpeechRecognition();
    toggleInputMode('text'); 
    conversationHistory = [initializeSystemPrompt()];
    addMessage(languageConfig[currentLanguage].greeting(currentTutor.name), false);

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js', {scope: './'})
                .then(reg => {
                    console.log('Service Worker registered with scope:', reg.scope);
                    reg.update().catch(err => console.log('Service Worker update failed:', err));
                    
                    if (navigator.serviceWorker.controller) {
                        console.log('Service Worker is controlling the page');
                        
                        if (isPWA()) {
                            navigator.serviceWorker.controller.postMessage({
                                type: 'SET_PWA_MODE'
                            });
                        }
                    }
                })
                .catch(err => {
                    console.log('Service Worker registration failed:', err);
                });
        });
    }
});