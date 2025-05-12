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
    
    // Check if we're running on an external server by detecting if websim is available
    try {
        isExternalServer = typeof websim === 'undefined';
    } catch (e) {
        isExternalServer = true;
        console.log('Running on external server without websim API');
    }
    
    // Add PWA detection
    const isPWA = () => {
        return window.matchMedia('(display-mode: standalone)').matches || 
               window.navigator.standalone === true;
    };
    
    // Store PWA status in sessionStorage for consistent access
    if (isPWA()) {
        sessionStorage.setItem('pwaMode', 'true');
        
        // Communicate to service worker that we're in PWA mode
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_PWA_MODE'
            });
        }
    }
    
    // Character settings
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

    // PWA Installation - improved for online deployment
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        deferredPrompt = e;
        // Update UI to show the install button
        installBtn.style.display = 'block';
        
        // Log that the installation prompt was detected
        console.log('Installation prompt detected and saved');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            // The app is already installed or not installable
            // For Safari on iOS where beforeinstallprompt is not supported
            alert('To install this app on iOS: tap the share button and then "Add to Home Screen"');
            return;
        }
        
        // Show the installation prompt
        deferredPrompt.prompt();
        
        try {
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Installation outcome: ${outcome}`);
            
            if (outcome === 'accepted') {
                console.log('App was installed');
                
                // Prepare for redirection after installation
                sessionStorage.setItem('installAccepted', 'true');
                
                // On next launch, the PWA detection in index.html will handle redirection
            }
        } catch (error) {
            console.error('Error during installation:', error);
        }
        
        // We no longer need the prompt
        deferredPrompt = null;
        
        // Hide the install button
        installBtn.style.display = 'none';
    });

    // Initialize speech recognition - improved error handling
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
                    
                    // Show a user-friendly error message
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
            // Hide voice mode button on unsupported browsers
            voiceModeBtn.style.display = 'none';
        }
    }
    
    // Start recording
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
    
    // Stop recording
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
    
    // Get speech recognition language code
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
    
    // Get text-to-speech voice
    function getTTSVoice() {
        return `${currentLanguage}-${currentTutor.gender}`;
    }
    
    // Play audio for bot message - with external server compatibility
    async function playBotAudio(text) {
        // If we're on an external server, show a message instead of audio
        if (isExternalServer) {
            console.log('Text-to-speech not available on external server');
            return null;
        }
        
        const cacheKey = `${currentLanguage}-${currentTutor.gender}-${text}`;
        
        try {
            let audioUrl;
            
            if (audioCache[cacheKey]) {
                audioUrl = audioCache[cacheKey];
            } else {
                const result = await websim.textToSpeech({
                    text: text,
                    voice: getTTSVoice()
                });
                
                audioUrl = result.url;
                audioCache[cacheKey] = audioUrl;
            }
            
            const audio = new Audio(audioUrl);
            audio.play();
            
            return audio;
        } catch (error) {
            console.error('Text-to-speech error', error);
            return null;
        }
    }
    
    // Language configuration
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

    // Initialize system prompt based on language and tutor
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

    // Add message to chat
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

        // Add audio controls for bot messages - hide on external servers
        if (!isUser && !isExternalServer) {
            const audioControls = document.createElement('div');
            audioControls.className = 'audio-controls';
            
            const playButton = document.createElement('button');
            playButton.className = 'audio-btn';
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.title = 'Play message';
            playButton.addEventListener('click', () => {
                playBotAudio(text);
                playButton.disabled = true;
                playButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                
                setTimeout(() => {
                    playButton.disabled = false;
                    playButton.innerHTML = '<i class="fas fa-play"></i>';
                }, 2000);
            });
            
            audioControls.appendChild(playButton);
            messageContent.appendChild(audioControls);
            
            // Play audio automatically in voice mode
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
                
                // Create main correction text
                correctionItem.textContent = `"${correction.error}" should be "${correction.correction}" - ${correction.explanation}`;
                correctionList.appendChild(correctionItem);
                
                // Add the full corrected sentence if available
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

    // Get fallback response for external servers without AI
    function getFallbackResponse() {
        const responses = languageConfig[currentLanguage].fallbackResponses;
        const randomIndex = Math.floor(Math.random() * responses.length);
        return {
            response: responses[randomIndex],
            corrections: []
        };
    }

    // Generate AI response - with fallback for external servers
    async function generateAIResponse(userText) {
        // If we're on an external server without websim, use fallback responses
        if (isExternalServer) {
            console.log('Using fallback responses for external server');
            return getFallbackResponse();
        }
        
        try {
            // Check if the websim object exists
            if (typeof websim === 'undefined') {
                console.log('Websim API not available, using fallback');
                return getFallbackResponse();
            }
            
            // Add user message to conversation history
            conversationHistory.push({
                role: "user",
                content: userText
            });
            
            // Limit conversation history to last 10 messages to prevent token limit issues
            if (conversationHistory.length > 12) { // 10 messages + 2 system messages
                conversationHistory = [
                    conversationHistory[0], // Keep system message
                    ...conversationHistory.slice(-11) // Keep last 11 messages
                ];
            }
            
            // Get AI response
            const completion = await websim.chat.completions.create({
                messages: conversationHistory,
                json: true
            });
            
            // Parse the response
            let result;
            try {
                result = JSON.parse(completion.content);
            } catch (parseError) {
                console.error("Error parsing AI response:", parseError);
                // Fallback for when the response isn't valid JSON
                result = {
                    response: completion.content || "I'm sorry, I couldn't generate a proper response.",
                    corrections: []
                };
            }
            
            // Add AI response to conversation history
            conversationHistory.push({
                role: "assistant",
                content: completion.content
            });
            
            return result;
        } catch (error) {
            console.error("Error generating AI response:", error);
            return getFallbackResponse();
        }
    }

    // Handle name response
    async function handleNameResponse(name) {
        userName = name.trim();
        
        // Add a special system message about the user's name
        conversationHistory.push({
            role: "system",
            content: `The user's name is ${userName}. Greet them warmly in ${languageConfig[currentLanguage].name} and suggest a topic to discuss.`
        });
        
        let result;
        if (isExternalServer) {
            // Use a simple greeting if on external server
            const langConfig = languageConfig[currentLanguage];
            const greeting = `${langConfig.greeting(currentTutor.name)} ${userName}! `;
            result = {
                response: greeting + langConfig.fallbackResponses[0],
                corrections: []
            };
        } else {
            // Use AI response if available
            result = await generateAIResponse("My name is " + userName);
        }
        
        addMessage(result.response, false, result.corrections);
        isAskingName = false;
    }

    // Bot response function
    async function botResponse(userText) {
        if (isAskingName) {
            await handleNameResponse(userText);
            return;
        }
        
        // Show typing indicator
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
            
            // Remove typing indicator
            chatMessages.removeChild(typingDiv);
            
            // Add the actual response
            addMessage(result.response, false, result.corrections);
        } catch (error) {
            // Remove typing indicator
            chatMessages.removeChild(typingDiv);
            
            // Add error message
            addMessage("I'm sorry, I couldn't process your message. Please try again.", false);
        }
    }

    // Send message function
    function sendMessage() {
        const text = userInput.value.trim();
        if (text === '') return;
        
        addMessage(text, true);
        userInput.value = '';
        
        botResponse(text);
    }

    // Toggle input mode
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

    // Change tutor function
    function changeTutor(tutorId) {
        if (currentTutor.id === tutorId) return;
        
        // Update UI
        tutorButtons.forEach(btn => {
            if (btn.dataset.tutor === tutorId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update current tutor
        currentTutor = tutors[tutorId];
        
        // Reset the conversation with the new tutor
        resetConversation();
    }

    // Change language function
    function changeLanguage(langCode) {
        if (currentLanguage === langCode) return;
        
        // Update UI
        languageButtons.forEach(btn => {
            if (btn.dataset.lang === langCode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Update language
        currentLanguage = langCode;
        
        // Reset the conversation with the new language
        resetConversation();
    }

    // Reset conversation
    function resetConversation() {
        // Update UI elements
        sendBtn.textContent = languageConfig[currentLanguage].sendBtn;
        userInput.placeholder = isVoiceMode ? 
            languageConfig[currentLanguage].voiceInputPlaceholder : 
            languageConfig[currentLanguage].inputPlaceholder;
        
        // Clear chat and reset state
        chatMessages.innerHTML = '';
        isAskingName = true;
        userName = "";
        
        // Reset conversation history with new system prompt
        conversationHistory = [initializeSystemPrompt()];
        
        // Add greeting message
        const greeting = languageConfig[currentLanguage].greeting(currentTutor.name);
        addMessage(greeting, false);
    }

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Voice input event listeners
    micBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    
    textModeBtn.addEventListener('click', () => toggleInputMode('text'));
    voiceModeBtn.addEventListener('click', () => toggleInputMode('voice'));
    
    // Tutor selection event listeners
    tutorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            changeTutor(btn.dataset.tutor);
        });
    });
    
    // Language selection event listeners
    languageButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            changeLanguage(btn.dataset.lang);
        });
    });
    
    // Initialize 
    initSpeechRecognition();
    toggleInputMode('text'); // Start in text mode by default
    conversationHistory = [initializeSystemPrompt()];
    addMessage(languageConfig[currentLanguage].greeting(currentTutor.name), false);

    // Service worker registration with improved error handling
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js', {scope: './'})
                .then(reg => {
                    console.log('Service Worker registered with scope:', reg.scope);
                    // Update service worker if needed
                    reg.update().catch(err => console.log('Service Worker update failed:', err));
                    
                    // Check for existing controller
                    if (navigator.serviceWorker.controller) {
                        console.log('Service Worker is controlling the page');
                        
                        // If we're in PWA mode, tell the service worker
                        if (isPWA()) {
                            navigator.serviceWorker.controller.postMessage({
                                type: 'SET_PWA_MODE'
                            });
                        }
                    }
                })
                .catch(err => {
                    console.log('Service Worker registration failed:', err);
                    // Continue without service worker
                });
        });
    }
});