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

    // PWA Installation
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later
        deferredPrompt = e;
        // Update UI to show the install button
        installBtn.style.display = 'block';
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            // The app is already installed or not installable
            return;
        }
        // Show the installation prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        // We no longer need the prompt
        deferredPrompt = null;
        // Hide the install button
        installBtn.style.display = 'none';
    });

    // Hide the install button by default - will show only if the app can be installed
    installBtn.style.display = 'none';

    // Initialize speech recognition
    function initSpeechRecognition() {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
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
            };
            
            recognition.onend = () => {
                stopRecording();
            };
        } else {
            alert('Your browser does not support speech recognition. Please use Chrome or Edge.');
            voiceModeBtn.disabled = true;
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
    
    // Play audio for bot message
    async function playBotAudio(text) {
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
            voiceInputPlaceholder: "Click the microphone to speak..."
        },
        es: {
            name: "Spanish",
            greeting: (tutorName) => `¡Hola! Mi nombre es ${tutorName}. ¡Practiquemos español juntos! ¿Cómo te llamas?`,
            namePrompt: "¿Cómo te llamas?",
            sendBtn: "Enviar",
            typingText: "Escribiendo...",
            inputPlaceholder: "Escribe tu mensaje aquí...",
            voiceInputPlaceholder: "Haz clic en el micrófono para hablar..."
        },
        fr: {
            name: "French",
            greeting: (tutorName) => `Bonjour ! Je m'appelle ${tutorName}. Pratiquons le français ensemble ! Comment t'appelles-tu ?`,
            namePrompt: "Comment t'appelles-tu ?",
            sendBtn: "Envoyer",
            typingText: "En train d'écrire...",
            inputPlaceholder: "Écrivez votre message ici...",
            voiceInputPlaceholder: "Cliquez sur le microphone pour parler..."
        },
        it: {
            name: "Italian",
            greeting: (tutorName) => `Ciao! Mi chiamo ${tutorName}. Pratichiamo l'italiano insieme! Come ti chiami?`,
            namePrompt: "Come ti chiami?",
            sendBtn: "Invia",
            typingText: "Digitando...",
            inputPlaceholder: "Scrivi il tuo messaggio qui...",
            voiceInputPlaceholder: "Clicca sul microfono per parlare..."
        },
        zh: {
            name: "Chinese",
            greeting: (tutorName) => `你好！我是 ${tutorName}。让我们一起练习中文吧！你叫什么名字？`,
            namePrompt: "你叫什么名字？",
            sendBtn: "发送",
            typingText: "正在输入...",
            inputPlaceholder: "在这里输入您的消息...",
            voiceInputPlaceholder: "点击麦克风说话..."
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

        // Add audio controls for bot messages
        if (!isUser) {
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

    // Generate AI response
    async function generateAIResponse(userText) {
        try {
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
            const result = JSON.parse(completion.content);
            
            // Add AI response to conversation history
            conversationHistory.push({
                role: "assistant",
                content: completion.content
            });
            
            return result;
        } catch (error) {
            console.error("Error generating AI response:", error);
            return {
                response: "I'm sorry, I'm having trouble processing your message. Could you try again?",
                corrections: []
            };
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
        
        const result = await generateAIResponse("My name is " + userName);
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
});