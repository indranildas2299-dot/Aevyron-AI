package com.indranil.aevyron.data

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val title: String,
    val systemPrompt: String,
    val modelId: String?,
    val isArchived: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "messages",
    indices = [Index("conversationId")]
)
data class MessageEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val role: String, // "user" | "assistant" | "system"
    val content: String,
    val ttftMs: Long? = null,
    val generationDurationMs: Long? = null,
    val totalElapsedMs: Long? = null,
    val tokenCount: Int? = null,
    val tokensPerSecond: Double? = null,
    val attachmentsJson: String = "[]",
    val createdAt: Long
)

@Entity(
    tableName = "memory_facts",
    indices = [Index("category")]
)
data class MemoryFactEntity(
    @PrimaryKey val id: String,
    val content: String,
    val category: String, // Preference, Goal, Project, Instruction, Personal
    val sourceConversationId: String? = null,
    val isConfirmed: Boolean = true,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "registered_models")
data class RegisteredModelEntity(
    @PrimaryKey val id: String,
    val fileName: String,
    val safUriString: String,
    val fileSizeBytes: Long,
    val architecture: String,
    val quantization: String,
    val contextLength: Int = 2048,
    val threadCount: Int = 4,
    val batchSize: Int = 256,
    val gpuLayers: Int = 0,
    val supportsVision: Boolean = false,
    val supportsAudio: Boolean = false,
    val addedAt: Long
)

@Dao
interface AevyronDao {
    @Query("SELECT * FROM conversations WHERE isArchived = 0 ORDER BY updatedAt DESC")
    fun observeConversations(): Flow<List<ConversationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertConversation(conversation: ConversationEntity)

    @Query("DELETE FROM conversations WHERE id = :conversationId")
    suspend fun deleteConversation(conversationId: String)

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    fun observeMessages(conversationId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessage(message: MessageEntity)

    @Query("SELECT * FROM memory_facts WHERE isConfirmed = 1 ORDER BY updatedAt DESC")
    fun observeConfirmedMemories(): Flow<List<MemoryFactEntity>>

    @Query("SELECT * FROM memory_facts WHERE isConfirmed = 0 ORDER BY createdAt DESC")
    fun observeSuggestedMemories(): Flow<List<MemoryFactEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMemoryFact(fact: MemoryFactEntity)

    @Query("DELETE FROM memory_facts WHERE id = :factId")
    suspend fun deleteMemoryFact(factId: String)

    @Query("SELECT * FROM registered_models ORDER BY addedAt DESC")
    fun observeModels(): Flow<List<RegisteredModelEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertModel(model: RegisteredModelEntity)

    @Query("DELETE FROM registered_models WHERE id = :modelId")
    suspend fun deleteModel(modelId: String)
}

@Database(
    entities = [
        ConversationEntity::class,
        MessageEntity::class,
        MemoryFactEntity::class,
        RegisteredModelEntity::class
    ],
    version = 2,
    exportSchema = true
)
abstract class AevyronDatabase : RoomDatabase() {
    abstract fun dao(): AevyronDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE registered_models ADD COLUMN supportsAudio INTEGER NOT NULL DEFAULT 0"
                )
            }
        }

        @Volatile
        private var INSTANCE: AevyronDatabase? = null

        fun getInstance(context: Context): AevyronDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    AevyronDatabase::class.java,
                    "aevyron_personal_vault.db"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
