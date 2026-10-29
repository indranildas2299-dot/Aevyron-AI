package com.indranil.aevyron

import com.indranil.aevyron.data.MemoryFactEntity
import com.indranil.aevyron.memory.MemoryPipeline
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class MemoryPipelineTest {
    @Test
    fun detectsDuplicatePersonalFact() {
        val existing = listOf(
            MemoryFactEntity(
                id = "m1",
                content = "My primary phone is a Realme P4 5G with 8 GB RAM and 256 GB storage",
                category = "Personal",
                createdAt = 1000L,
                updatedAt = 1000L
            )
        )
        val duplicate = MemoryPipeline.isDuplicate(
            "My primary phone is a Realme P4 5G with 8 GB RAM",
            existing
        )
        assertNotNull(duplicate)
        assertEquals("m1", duplicate?.id)
    }
}
