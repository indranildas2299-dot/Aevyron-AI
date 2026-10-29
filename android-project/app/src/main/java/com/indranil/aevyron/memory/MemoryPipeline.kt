package com.indranil.aevyron.memory

import com.indranil.aevyron.data.MemoryFactEntity
import com.indranil.aevyron.data.MessageEntity

object MemoryPipeline {
    private val STOP_WORDS = setOf(
        "the", "and", "for", "that", "this", "with", "from", "have", "what",
        "when", "where", "which", "about", "into", "your", "please", "can", "you"
    )

    fun tokenize(text: String): Set<String> {
        return text.lowercase()
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .split(Regex("\\s+"))
            .filter { it.length >= 3 && it !in STOP_WORDS }
            .toSet()
    }

    fun isDuplicate(candidate: String, existing: List<MemoryFactEntity>): MemoryFactEntity? {
        val candTokens = tokenize(candidate)
        if (candTokens.isEmpty()) return null
        val normalizedCand = candidate.trim().lowercase()
        for (item in existing) {
            val normExisting = item.content.trim().lowercase()
            if (normExisting == normalizedCand || normExisting.contains(normalizedCand) || normalizedCand.contains(normExisting)) {
                return item
            }
            val exTokens = tokenize(item.content)
            if (exTokens.isNotEmpty()) {
                val intersection = candTokens.intersect(exTokens).size.toDouble()
                val union = candTokens.union(exTokens).size.toDouble()
                if (union > 0 && (intersection / union) >= 0.72) {
                    return item
                }
            }
        }
        return null
    }

    fun retrieveRelevantMemories(
        query: String,
        confirmedMemories: List<MemoryFactEntity>,
        limit: Int = 6
    ): List<MemoryFactEntity> {
        val queryTokens = tokenize(query)
        if (queryTokens.isEmpty()) {
            return confirmedMemories
                .sortedByDescending { if (it.category == "Instruction" || it.category == "Preference") 1 else 0 }
                .take(limit)
        }
        return confirmedMemories
            .map { fact ->
                val factTokens = tokenize(fact.content)
                val overlap = queryTokens.intersect(factTokens).size
                val categoryBoost = if (fact.category == "Instruction") 2 else if (fact.category == "Preference") 1 else 0
                Pair(fact, overlap * 3 + categoryBoost)
            }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    fun buildBoundedChatMlPrompt(
        systemInstructions: String,
        memories: List<MemoryFactEntity>,
        history: List<MessageEntity>,
        maxContextTokens: Int
    ): String {
        val memoryBlock = if (memories.isEmpty()) {
            ""
        } else {
            "\n\n[Personal Memory Vault — Confirmed User Facts]\n" +
                memories.joinToString("\n") { "- (${it.category}) ${it.content}" }
        }
        val fullSystem = (systemInstructions.trim() + memoryBlock).trim()
        val maxChars = (maxContextTokens * 3.5).toInt().coerceAtLeast(1024)

        val sb = StringBuilder()
        sb.append("<|im_start|>system\n").append(fullSystem).append("<|im_end|>\n")

        val selectedMessages = ArrayDeque<MessageEntity>()
        var currentChars = sb.length + 64
        for (msg in history.asReversed()) {
            val formattedLen = msg.content.length + 32
            if (currentChars + formattedLen > maxChars && selectedMessages.isNotEmpty()) {
                break
            }
            selectedMessages.addFirst(msg)
            currentChars += formattedLen
        }

        for (msg in selectedMessages) {
            sb.append("<|im_start|>").append(msg.role).append("\n")
                .append(msg.content)
                .append("<|im_end|>\n")
        }
        sb.append("<|im_start|>assistant\n")
        return sb.toString()
    }
}
