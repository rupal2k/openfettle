package com.example.exerciseform.sdk.catalogue

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class ExerciseCatalogue(
    val schemaVersion: String,
    val source: String,
    val exercises: List<ExerciseRecord>
)

data class ExerciseRecord(
    val id: String,
    val name: String,
    val category: String,
    val bodyPart: String,
    val equipment: String,
    val targetMuscles: List<String>,
    val secondaryMuscles: List<String>,
    val instructions: List<String>,
    val description: String,
    val variations: List<String> = emptyList(),
    val tracking: TrackingRequirements? = null
)

data class TrackingRequirements(
    val hold: Boolean = false,
    val track: String? = null,
    val needs: List<String> = emptyList()
)

class ExerciseCatalogueException(message: String) : IllegalArgumentException(message)

object ExerciseCatalogueParser {
    const val CURRENT_SCHEMA_VERSION = "1.0"

    fun parseCatalogue(json: String): ExerciseCatalogue {
        val root = JSONObject(json)
        val version = root.optString("schemaVersion")
        if (version != CURRENT_SCHEMA_VERSION) throw ExerciseCatalogueException("Unsupported schemaVersion: $version")
        val records = root.optJSONArray("exercises") ?: throw ExerciseCatalogueException("Missing exercises")
        val exercises = (0 until records.length()).map { parseRecord(records.getJSONObject(it), "exercises[$it]") }
        validateUniqueIds(exercises)
        return ExerciseCatalogue(version, root.optString("source", "unknown"), exercises)
    }

    /** Converts one openGym catalogue exercise into the versioned local record shape. */
    fun parseOpenGymExercise(json: String): ExerciseRecord = parseRecord(JSONObject(json), "exercise")

    private fun parseRecord(value: JSONObject, path: String): ExerciseRecord {
        fun required(name: String): String = value.optString(name).trim().ifEmpty {
            throw ExerciseCatalogueException("Missing $path.$name")
        }
        fun strings(name: String): List<String> = value.optJSONArray(name)?.toStringList() ?: emptyList()
        val target = value.optString("target").trim().ifEmpty {
            value.optJSONArray("targetMuscles")?.optString(0, "")?.trim().orEmpty()
        }
        if (target.isEmpty()) throw ExerciseCatalogueException("Missing $path.target")
        val variations = buildList {
            value.optJSONArray("variations")?.toStringList()?.let(::addAll)
            value.optString("variantOf").trim().takeIf { it.isNotEmpty() }?.let(::add)
            value.optString("femaleVariant").trim().takeIf { it.isNotEmpty() }?.let(::add)
        }
        val trackingObject = value.optJSONObject("tracking")
        val tracking = if (trackingObject != null || value.has("hold") || value.has("track") || value.has("needs")) TrackingRequirements(
            hold = trackingObject?.optBoolean("hold", false) ?: value.optBoolean("hold", false),
            track = (trackingObject?.optString("track") ?: value.optString("track")).trim().takeIf { it.isNotEmpty() },
            needs = trackingObject?.optJSONArray("needs")?.toStringList() ?: strings("needs")
        ) else null
        return ExerciseRecord(
            id = required("id"), name = required("name"), category = required("category"),
            bodyPart = required("bodyPart"), equipment = required("equipment"),
            targetMuscles = listOf(target), secondaryMuscles = strings("secondaryMuscles"),
            instructions = strings("instructions").also { if (it.isEmpty()) throw ExerciseCatalogueException("Missing $path.instructions") },
            description = required("description"), variations = variations, tracking = tracking
        )
    }

    private fun validateUniqueIds(exercises: List<ExerciseRecord>) {
        val duplicate = exercises.groupingBy { it.id }.eachCount().filterValues { it > 1 }.keys.firstOrNull()
        if (duplicate != null) throw ExerciseCatalogueException("Duplicate exercise id: $duplicate")
    }

    private fun JSONArray.toStringList(): List<String> = (0 until length()).map { getString(it).trim() }.filter { it.isNotEmpty() }
}

class ExerciseCatalogueRepository private constructor(private val catalogue: ExerciseCatalogue) {
    fun getById(id: String): ExerciseRecord? = catalogue.exercises.firstOrNull { it.id == id }
    fun searchByName(query: String): List<ExerciseRecord> = catalogue.exercises.filter { it.name.contains(query.trim(), ignoreCase = true) }
    fun byCategory(category: String): List<ExerciseRecord> = catalogue.exercises.filter { it.category.equals(category.trim(), ignoreCase = true) }
    fun byEquipment(equipment: String): List<ExerciseRecord> = catalogue.exercises.filter { it.equipment.equals(equipment.trim(), ignoreCase = true) }
    fun byTargetMuscle(muscle: String): List<ExerciseRecord> = catalogue.exercises.filter {
        it.targetMuscles.any { target -> target.equals(muscle.trim(), ignoreCase = true) }
    }
    fun all(): List<ExerciseRecord> = catalogue.exercises

    companion object {
        fun fromJson(json: String) = ExerciseCatalogueRepository(ExerciseCatalogueParser.parseCatalogue(json))
        fun fromAssets(context: Context, assetPath: String): ExerciseCatalogueRepository =
            context.assets.open(assetPath).bufferedReader().use { fromJson(it.readText()) }
    }
}
