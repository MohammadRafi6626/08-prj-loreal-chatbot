/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const workerUrl = "https://loreal-worker.mxr5784.workers.dev/";

// System prompt for the OpenAI assistant
const systemPrompt =
  "You are a helpful L'Oréal virtual assistant. Only answer questions related to L'Oréal products (makeup, skincare, haircare, fragrances), beauty routines, and recommendations. Politely decline unrelated topics. Remember user details like their name, skin type, preferences, and previous recommendations to provide personalized advice.";

// Store conversation history and user details
let conversationHistory = [];
let userDetails = {
  name: null,
  skinType: null,
  preferences: [],
  previousRecommendations: [],
};

// Function to extract user details from messages
function extractUserDetails(userMessage, assistantResponse) {
  try {
    // Extract name if mentioned
    const nameMatch = userMessage.match(
      /(?:my name is|i'm|i am|call me)\s+([a-zA-Z]+)/i
    );
    if (nameMatch) {
      userDetails.name = nameMatch[1];
    }

    // Extract skin type if mentioned
    const skinTypeMatch = userMessage.match(
      /(?:my skin is|i have)\s+(oily|dry|combination|sensitive|normal)\s+skin/i
    );
    if (skinTypeMatch) {
      userDetails.skinType = skinTypeMatch[1].toLowerCase();
    }

    // Extract preferences from user messages
    const preferenceKeywords = [
      "prefer",
      "like",
      "love",
      "hate",
      "dislike",
      "allergic to",
    ];
    preferenceKeywords.forEach((keyword) => {
      if (userMessage.toLowerCase().includes(keyword)) {
        userDetails.preferences.push(userMessage);
      }
    });

    // Extract product recommendations from assistant responses
    if (
      assistantResponse &&
      assistantResponse.toLowerCase().includes("recommend")
    ) {
      userDetails.previousRecommendations.push(assistantResponse);
    }
  } catch (error) {
    console.error("Error extracting user details:", error);
    // Continue without crashing the app
  }
}

// Function to build messages array with conversation history
function buildMessagesArray(newUserMessage) {
  try {
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    // Add user context if available
    if (
      userDetails.name ||
      userDetails.skinType ||
      userDetails.preferences.length > 0
    ) {
      let contextMessage = "User context: ";
      if (userDetails.name) contextMessage += `Name: ${userDetails.name}. `;
      if (userDetails.skinType)
        contextMessage += `Skin type: ${userDetails.skinType}. `;
      if (userDetails.preferences.length > 0) {
        contextMessage += `Preferences: ${userDetails.preferences
          .slice(-3)
          .join("; ")}. `;
      }
      if (userDetails.previousRecommendations.length > 0) {
        contextMessage += `Previous recommendations: ${userDetails.previousRecommendations
          .slice(-2)
          .join("; ")}`;
      }

      messages.push({
        role: "system",
        content: contextMessage,
      });
    }

    // Add recent conversation history (last 6 messages to avoid token limits)
    const recentHistory = conversationHistory.slice(-6);
    messages.push(...recentHistory);

    // Add the new user message
    messages.push({
      role: "user",
      content: newUserMessage,
    });

    return messages;
  } catch (error) {
    console.error("Error building messages array:", error);
    // Return basic message structure if there's an error
    return [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: newUserMessage,
      },
    ];
  }
}
// Function to add a message to the chat window
function addMessage(content, isUser = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = isUser ? "msg user" : "msg ai";

  const messageContent = document.createElement("div");
  messageContent.className = "msg-content";
  messageContent.textContent = content;

  messageDiv.appendChild(messageContent);
  chatWindow.appendChild(messageDiv);

  // Scroll to bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Function to reset chat and show user's question with assistant response
function resetChatWithQuestion(userQuestion, assistantResponse) {
  // Clear the chat window
  chatWindow.innerHTML = "";

  // Add the user's question
  addMessage(userQuestion, true);

  // Add the assistant's response
  addMessage(assistantResponse, false);
}

// Function to add message to conversation history
function addToHistory(userMessage, assistantResponse) {
  try {
    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    // Add assistant response to history
    if (assistantResponse) {
      conversationHistory.push({
        role: "assistant",
        content: assistantResponse,
      });
    }

    // Keep only last 10 exchanges (20 messages) to manage memory
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
  } catch (error) {
    console.error("Error adding to conversation history:", error);
    // Continue without crashing the app
  }
}

// Set initial message
chatWindow.innerHTML = "";
addMessage("👋 Hello! How can I help you with L'Oréal products today?");

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();
  if (!userMessage) return;

  // Clear input immediately
  userInput.value = "";

  // Show loading state
  resetChatWithQuestion(userMessage, "Thinking...");

  try {
    // Build messages array with conversation history and user context
    const messages = buildMessagesArray(userMessage);

    // Send request to Cloudflare Worker
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages,
      }),
    });

    // Check if the response is ok (status 200-299)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Check if we got a valid response
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const assistantResponse = data.choices[0].message.content;

      // Extract and store user details from this conversation turn
      extractUserDetails(userMessage, assistantResponse);

      // Add to conversation history
      addToHistory(userMessage, assistantResponse);

      // Display the response
      resetChatWithQuestion(userMessage, assistantResponse);
    } else if (data.error) {
      // Handle specific API errors
      console.error("API Error:", data.error);
      resetChatWithQuestion(
        userMessage,
        `Sorry, there was an issue: ${
          data.error.message || "Unknown error"
        }. Please try again.`
      );
    } else {
      // Handle unexpected response format
      console.error("Unexpected response format:", data);
      resetChatWithQuestion(
        userMessage,
        "Sorry, I received an unexpected response. Please try rephrasing your question."
      );
    }
  } catch (error) {
    console.error("Error calling Cloudflare Worker:", error);

    // Provide specific error messages based on the error type
    let errorMessage = "Sorry, there was an error connecting to the service. ";

    if (error.name === "TypeError" && error.message.includes("fetch")) {
      errorMessage += "Please check your internet connection and try again.";
    } else if (error.name === "SyntaxError") {
      errorMessage +=
        "There was an issue processing the response. Please try again.";
    } else if (error.message.includes("timeout")) {
      errorMessage += "The request timed out. Please try again.";
    } else {
      errorMessage += "Please try again in a moment.";
    }

    resetChatWithQuestion(userMessage, errorMessage);
  }
});
