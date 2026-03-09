import { Router } from "express";
import { queryAll, queryOne, execute } from "../database.js";

export const chatRoutes = Router();

// Get chat history
chatRoutes.get("/history", async (req, res) => {
  const messages = await queryAll(
    "SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 100",
    [req.userId]
  );
  res.json(messages);
});

// Send message and get AI response
chatRoutes.post("/send", async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message required" });

  const userMsg = message.trim().substring(0, 2000);

  // Save user message
  await execute("INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'user', ?)", [req.userId, userMsg]);

  // Gather user's study context
  const context = await gatherUserContext(req.userId);

  // Generate intelligent response
  const reply = generateResponse(userMsg, context);

  // Save assistant reply
  await execute("INSERT INTO chat_messages (user_id, role, content) VALUES (?, 'assistant', ?)", [req.userId, reply]);

  res.json({ reply });
});

// Clear chat history
chatRoutes.delete("/history", async (req, res) => {
  await execute("DELETE FROM chat_messages WHERE user_id = ?", [req.userId]);
  res.json({ success: true });
});

async function gatherUserContext(userId) {
  const subjects = await queryAll("SELECT name, color FROM subjects WHERE user_id = ?", [userId]);
  const noteCount = (await queryOne("SELECT COUNT(*) as c FROM notes WHERE user_id = ?", [userId]))?.c || 0;
  const cardCount = (await queryOne("SELECT COUNT(*) as c FROM flashcards WHERE user_id = ?", [userId]))?.c || 0;
  const quizCount = (await queryOne("SELECT COUNT(*) as c FROM quizzes WHERE user_id = ?", [userId]))?.c || 0;
  const dueCards = (await queryOne("SELECT COUNT(*) as c FROM flashcards WHERE user_id = ? AND next_review <= datetime('now')", [userId]))?.c || 0;
  const todayMins = (await queryOne("SELECT COALESCE(SUM(duration_minutes), 0) as m FROM study_sessions WHERE user_id = ? AND session_date = date('now')", [userId]))?.m || 0;
  const weekMins = (await queryOne("SELECT COALESCE(SUM(duration_minutes), 0) as m FROM study_sessions WHERE user_id = ? AND session_date >= date('now', '-7 days')", [userId]))?.m || 0;
  const recentNotes = await queryAll("SELECT title, subject_id FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5", [userId]);
  const recentCards = await queryAll("SELECT question, answer, subject_id FROM flashcards WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", [userId]);
  const settings = await queryOne("SELECT study_goal_minutes FROM user_settings WHERE user_id = ?", [userId]);
  const goalMins = settings?.study_goal_minutes || 60;

  return { subjects, noteCount, cardCount, quizCount, dueCards, todayMins, weekMins, recentNotes, recentCards, goalMins };
}

function generateResponse(message, ctx) {
  const lower = message.toLowerCase();

  // Greeting
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|what'?s?\s*up)/i.test(lower)) {
    const greetings = [
      `Hello! I'm your StudyHub AI assistant. You have ${ctx.subjects.length} subject${ctx.subjects.length !== 1 ? 's' : ''} and ${ctx.dueCards} flashcard${ctx.dueCards !== 1 ? 's' : ''} due for review. How can I help you study today?`,
      `Hey there! Ready to study? You've logged ${ctx.todayMins} minutes today. What would you like to work on?`,
      `Hi! I'm here to help you learn. You have ${ctx.noteCount} notes, ${ctx.cardCount} flashcards, and ${ctx.quizCount} quizzes. Ask me anything!`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // Study stats / progress
  if (/\b(stats|progress|overview|how\s*(am\s*i|i'm)\s*doing|dashboard|summary)\b/i.test(lower)) {
    const goalPct = ctx.goalMins > 0 ? Math.round((ctx.todayMins / ctx.goalMins) * 100) : 0;
    let response = `Here's your study overview:\n\n`;
    response += `📘 Subjects: ${ctx.subjects.length} (${ctx.subjects.map(s => s.name).join(', ') || 'none yet'})\n`;
    response += `📝 Notes: ${ctx.noteCount}\n`;
    response += `🃏 Flashcards: ${ctx.cardCount} (${ctx.dueCards} due for review)\n`;
    response += `❓ Quizzes: ${ctx.quizCount}\n`;
    response += `⏱️ Today: ${ctx.todayMins}/${ctx.goalMins} min (${goalPct}% of goal)\n`;
    response += `📈 This week: ${ctx.weekMins} minutes total\n\n`;
    if (goalPct >= 100) response += `🎉 You've hit your daily study goal! Amazing work!`;
    else if (goalPct >= 50) response += `💪 You're over halfway to your daily goal. Keep going!`;
    else if (ctx.todayMins > 0) response += `🌱 Good start! Keep the momentum going to reach your ${ctx.goalMins}-minute goal.`;
    else response += `🚀 Start a study session to begin tracking your progress today!`;
    return response;
  }

  // Flashcard review help
  if (/\b(review|flashcard|cards?\s*due|spaced\s*repetition|revision)\b/i.test(lower)) {
    if (ctx.dueCards > 0) {
      return `You have ${ctx.dueCards} flashcard${ctx.dueCards !== 1 ? 's' : ''} due for review! 🃏\n\nSpaced repetition tips:\n• Review cards you rate "Hard" more frequently to strengthen weak areas\n• Try to review at the same time each day for consistency\n• Focus on understanding, not memorization\n• If you're stuck, break the concept into smaller cards\n\nGo to the Flashcards page and click "Review Due Cards" to start!`;
    }
    return `No flashcards due right now! 🎉 All caught up.\n\nTips to make great flashcards:\n• Keep questions specific and clear\n• One concept per card\n• Use your own words\n• Add cards from your notes for important concepts\n\nYou currently have ${ctx.cardCount} flashcard${ctx.cardCount !== 1 ? 's' : ''} total.`;
  }

  // Study tips
  if (/\b(tips?|advice|how\s*to\s*study|study\s*(method|technique|strate)|better|improve|effective)\b/i.test(lower)) {
    const tips = [
      `Here are proven study techniques:\n\n1. 🍅 Pomodoro Technique — Study for 25 min, break for 5 min. Use the Study Timer!\n2. 📝 Active Recall — Test yourself instead of re-reading. Use flashcards!\n3. 🔄 Spaced Repetition — Review at increasing intervals (built into your flashcards)\n4. 🎯 Interleaving — Mix different subjects during study sessions\n5. 📖 Elaboration — Explain concepts in your own words in Notes\n\nStart with a 25-minute focus session on your weakest subject!`,
      `Study smarter:\n\n• Break study into chunks with the Pomodoro timer ⏱️\n• Create flashcards as you learn for active recall\n• Take quizzes regularly to identify gaps\n• Review flashcards that are due — don't let them pile up\n• Set a daily study goal and stick to it\n\nYour current daily goal is ${ctx.goalMins} minutes. You've done ${ctx.todayMins} min today.`,
      `Top study strategies:\n\n1. 📌 Before studying, write down what you already know\n2. 🃏 After reading, create flashcards for key concepts\n3. ❓ Create practice quizzes to test understanding\n4. ⏱️ Use timed study sessions for focus\n5. 📊 Review your dashboard weekly to track progress\n\nWhich subject would you like to focus on?`,
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  // Subject-related
  if (/\b(subject|topic|course|class)\b/i.test(lower)) {
    if (ctx.subjects.length === 0) {
      return `You don't have any subjects yet! Go to the Subjects page and create your first subject to start organizing your study materials. 📘\n\nA good way to organize:\n• Create one subject per class or topic area\n• Choose distinct colors for easy identification\n• Pick an emoji icon that represents the subject`;
    }
    let response = `Your subjects: ${ctx.subjects.map(s => s.name).join(', ')}\n\n`;
    if (ctx.subjects.length < 3) {
      response += `Tip: Consider adding more subjects to organize your studies better. You can create separate subjects for different topics or chapters.`;
    } else {
      response += `Great organization! Make sure to spread your study time across all subjects. Check the dashboard for a breakdown of time spent on each.`;
    }
    return response;
  }

  // Notes help
  if (/\b(note|notes|write|writing|document|summarize|summary)\b/i.test(lower)) {
    let response = `Notes tips:\n\n`;
    response += `📝 You have ${ctx.noteCount} note${ctx.noteCount !== 1 ? 's' : ''}\n\n`;
    response += `Effective note-taking strategies:\n`;
    response += `• Write key concepts in your own words\n`;
    response += `• Use bullet points for main ideas\n`;
    response += `• Pin important notes for quick access\n`;
    response += `• After making notes, create flashcards from key points\n`;
    response += `• Review and update notes regularly\n\n`;
    if (ctx.recentNotes.length) {
      response += `Recent notes: ${ctx.recentNotes.map(n => n.title).join(', ')}`;
    }
    return response;
  }

  // Quiz help
  if (/\b(quiz|test|exam|assessment|practice\s*test)\b/i.test(lower)) {
    return `Quiz tips:\n\n❓ You have ${ctx.quizCount} quiz${ctx.quizCount !== 1 ? 'zes' : ''}\n\nMake the most of quizzes:\n• Create quizzes after completing a topic\n• Include questions that test understanding, not just memorization\n• Mix easy and hard questions\n• Retake quizzes where you scored below 80%\n• Use quiz results to identify weak areas, then create flashcards for them\n\nGo to the Quizzes page to create or take a quiz!`;
  }

  // Timer / focus / pomodoro
  if (/\b(timer|pomodoro|focus|concentrate|productive|distract|session)\b/i.test(lower)) {
    const goalPct = ctx.goalMins > 0 ? Math.round((ctx.todayMins / ctx.goalMins) * 100) : 0;
    return `Study Timer tips:\n\n⏱️ Today: ${ctx.todayMins}/${ctx.goalMins} min (${goalPct}% of goal)\n📈 This week: ${ctx.weekMins} minutes\n\nFor better focus:\n• Use the Pomodoro technique (25 min work, 5 min break)\n• Select a specific subject for each session\n• Put your phone in another room\n• Find a quiet, dedicated study space\n• After 4 Pomodoros, take a longer 15-20 min break\n\nGo to Study Timer to start a focused session!`;
  }

  // Motivation
  if (/\b(motivat|lazy|can'?t|don'?t\s*want|boring|hard|difficult|struggle|stressed|overwhelm)\b/i.test(lower)) {
    const motivations = [
      `I hear you — studying can be tough! Here's what might help:\n\n🎯 Start with just 10 minutes — often starting is the hardest part\n🏆 Celebrate small wins (you've already studied ${ctx.weekMins} min this week!)\n🎵 Try studying with background music\n📱 Remove distractions before starting\n💪 Remember: every minute of study compounds over time\n\nYou've got this! Start a short timer session and see how it goes.`,
      `It's normal to feel that way. Here are some strategies:\n\n1. Break big tasks into tiny, manageable pieces\n2. Use the 2-minute rule: if it takes <2 min, do it now\n3. Reward yourself after each study session\n4. Study with a friend or study group\n5. Mix up subjects to keep things fresh\n\nYou have ${ctx.subjects.length} subjects to explore. Start with whichever feels most interesting right now!`,
    ];
    return motivations[Math.floor(Math.random() * motivations.length)];
  }

  // Goal setting
  if (/\b(goal|target|plan|schedule|routine|habit)\b/i.test(lower)) {
    return `Study goals:\n\n🎯 Your daily goal: ${ctx.goalMins} minutes\n⏱️ Today: ${ctx.todayMins} minutes\n\nGoal-setting tips:\n• Start with a realistic daily goal you can stick to\n• Build a consistent routine — same time each day works best\n• Track your streak to stay motivated\n• Increase your goal gradually as you build the habit\n• Review your progress on the Dashboard weekly\n\nYou can adjust your daily study goal in Settings! Go to ⚙️ Settings to update it.`;
  }

  // Thank you
  if (/\b(thank|thanks|thx|cheers|appreciate)\b/i.test(lower)) {
    return `You're welcome! 😊 I'm always here if you need help. Keep up the great study habits! You've got ${ctx.dueCards} cards to review and ${Math.max(0, ctx.goalMins - ctx.todayMins)} minutes left to hit your daily goal. Let's go! 🚀`;
  }

  // What can you do
  if (/\b(what\s*can\s*you|help|capabilities|features|what\s*do\s*you)\b/i.test(lower)) {
    return `I'm your StudyHub AI assistant! Here's what I can help with:\n\n📊 Study Progress — Ask me about your stats, streaks, and progress\n🃏 Flashcard Review — Get tips on spaced repetition and review strategies\n📝 Note Taking — Learn effective note-taking methods\n❓ Quiz Strategies — Tips for creating and taking quizzes\n⏱️ Focus & Productivity — Pomodoro technique and focus strategies\n💪 Motivation — Get encouraged when studying feels hard\n🎯 Goal Setting — Plan your study routine\n📘 Subject Management — Organize your study materials\n💡 Study Techniques — Learn proven methods like active recall\n\nJust ask me anything about studying! I have full context of your StudyHub data.`;
  }

  // Explain a concept — help with recent cards
  if (/\b(explain|what\s*is|define|meaning|how\s*does|why\s*does|tell\s*me\s*about)\b/i.test(lower)) {
    if (ctx.recentCards.length > 0) {
      // Check if question relates to any flashcard
      for (const card of ctx.recentCards) {
        const cardWords = card.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const match = cardWords.some(w => lower.includes(w));
        if (match) {
          return `Based on your flashcards, here's what you've noted:\n\n❓ ${card.question}\n✅ ${card.answer}\n\nWant me to help you understand this better? Try breaking it down into smaller concepts and creating additional flashcards for each part. Teaching a concept to someone else (or to me!) is one of the best ways to master it.`;
        }
      }
    }
    return `That's a great question! While I'm specialized in helping you study effectively with StudyHub, I can suggest:\n\n1. 📝 Create a note about this topic to research it\n2. 🃏 Once you understand it, make flashcards for key points\n3. ❓ Create a quiz to test your understanding\n\nBreaking concepts into smaller pieces and using active recall (flashcards + quizzes) is the most effective way to learn and retain information.\n\nWhat subject does this relate to?`;
  }

  // Default - helpful general response
  const defaults = [
    `I'm your study assistant! I can help with:\n• 📊 Your study progress and stats\n• 🃏 Flashcard and review strategies\n• 📝 Note-taking tips\n• ⏱️ Focus and productivity advice\n• 💪 Motivation and study techniques\n\nYou currently have ${ctx.dueCards} cards due and ${Math.max(0, ctx.goalMins - ctx.todayMins)} min left to reach your daily goal. What would you like to work on?`,
    `I'm not sure I understand, but I'm here to help you study! Try asking about:\n• Your study progress or stats\n• How to study more effectively\n• Flashcard review tips\n• Quiz strategies\n• Focus and motivation\n\nOr just say "hi" and I'll give you a study overview! 📚`,
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}
