package com.example.exerciseform.sdk.ui

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.LifecycleOwner
import com.example.exerciseform.sdk.api.ExerciseFormEngine
import com.example.exerciseform.sdk.movementobserver.MovementObserverResult
import com.example.exerciseform.sdk.voiceover.VoiceOverQueue
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale
import kotlin.math.abs

private data class CoachInstruction(
    val id: String,
    val text: String?,
    val measurementIds: List<String>,
    val measurementRole: String,
    val targetDegrees: Float?,
    val expectedDirection: String?,
    val phase: String,
    val status: String
)

private data class CoachExercise(
    val id: String,
    val name: String,
    val instructions: List<CoachInstruction>
)

private data class CoachAssessment(val score: Float?, val label: String, val message: String)

private const val COMPLETION_THRESHOLD = 0.50f
private const val DEFAULT_VOICE_OVER_ENABLED = true

private fun humanReadableExerciseName(name: String): String = name
    .replace('_', ' ')
    .trim()
    .split(Regex("\\s+"))
    .joinToString(" ") { word ->
        word.lowercase().replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }

/** Groups catalogue variants without changing their original ids or instructions. */
@Composable
private fun ExercisePicker(exercises: List<CoachExercise>, onSelect: (Int) -> Unit) {
    var query by remember { mutableStateOf("") }
    val results = remember(query, exercises) {
        val normalized = query.trim().lowercase()
        val exact = exercises.withIndex().filter { it.value.name.trim().lowercase() == normalized }
        if (exact.isNotEmpty()) exact.take(10)
        else exercises.withIndex()
            .filter { normalized.isEmpty() || it.value.name.lowercase().contains(normalized) }
            .take(10)
    }
    Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding().padding(20.dp)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Text("What exercise are you going to do?", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Search the exercise catalogue", color = Color.LightGray, fontSize = 14.sp)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Exercise name") },
                placeholder = { Text("Try squat, push-up, lunge...") }
            )
            Spacer(Modifier.height(12.dp))
            Text("Showing up to 10 matches", color = Color.LightGray, fontSize = 13.sp)
            Spacer(Modifier.height(8.dp))
            if (results.isEmpty()) {
                Text("No exercises found.", color = Color.White, fontSize = 17.sp)
            } else {
                results.forEach { indexed ->
                    Button(
                        onClick = { onSelect(indexed.index) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    ) {
                        Column(Modifier.fillMaxWidth()) {
                            Text(humanReadableExerciseName(indexed.value.name), fontSize = 17.sp)
                            Text("ID ${indexed.value.id}", fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

private class InstructionCoachCatalog(context: Context) {
    val exercises: List<CoachExercise> =
        context.assets.open("exercise-catalogue-v1.json")
            .bufferedReader().use { reader ->
            val root = JSONObject(reader.readText())
            val records = root.getJSONArray("exercises")
            (0 until records.length()).map { index ->
                val exercise = records.getJSONObject(index)
                val instructions = exercise.getJSONArray("instructions")
                CoachExercise(
                    exercise.getString("exerciseId"),
                    exercise.getString("exerciseName"),
                    (0 until instructions.length()).mapNotNull { instructionIndex ->
                        val item = instructions.getJSONObject(instructionIndex)
                        val mappings = item.getJSONArray("angleMappings")
                        if (mappings.length() == 0) return@mapNotNull null
                        val measurementIds = (0 until mappings.length()).map {
                            mappings.getJSONObject(it).getString("measurementId")
                        }
                        val firstMapping = mappings.getJSONObject(0)
                        CoachInstruction(
                            item.getString("instructionId"),
                            if (item.isNull("originalText")) null else item.getString("originalText"),
                            measurementIds,
                            firstMapping.optString("measurementRole", "direct"),
                            if (firstMapping.isNull("targetMin")) null else firstMapping.getDouble("targetMin")
                                .toFloat(),
                            if (firstMapping.isNull("movementDirection")) null else firstMapping.getString(
                                "movementDirection"
                            ),
                            if (firstMapping.isNull("movementPhase")) "entire_movement" else firstMapping.getString(
                                "movementPhase"
                            ),
                            item.getString("mappingStatus")
                        )
                    })
            }
        }
}

/** Experimental evidence display. It is not calibrated form correctness. */
private fun assess(instruction: CoachInstruction, result: MovementObserverResult): CoachAssessment {
    if (instruction.status == "unsupported" || instruction.measurementIds.isEmpty()) {
        return CoachAssessment(
            null,
            "NOT MEASURABLE",
            "This instruction has no direct existing angle measurement."
        )
    }
    if (instruction.targetDegrees != null) {
        return CoachAssessment(
            null,
            "NEEDS CALIBRATION",
            "Target ${instruction.targetDegrees.toInt()}Â° is explicit, but no tolerance is established."
        )
    }
    val series = instruction.measurementIds.mapNotNull { result.graphAnglesDegrees[it] }
        .takeIf { it.isNotEmpty() }
    val frameCount = series?.maxOfOrNull { it.size } ?: 0
    if (series == null || frameCount < 5) {
        return CoachAssessment(
            null,
            "COLLECTING",
            "Move through the ${instruction.phase} phase to collect temporal evidence."
        )
    }
    val window = 30
    val values = (0 until frameCount).mapNotNull { index ->
        val samples = series.mapNotNull { it.getOrNull(it.lastIndex - (frameCount - 1 - index)) }
        samples.takeIf { it.isNotEmpty() }?.average()?.toFloat()
    }.takeLast(window)
    if (values.size < 5) return CoachAssessment(null, "COLLECTING", "Collecting angle frames.")
    val confidence =
        instruction.measurementIds.mapNotNull { result.frameConfidence[it] }.average().toFloat()
            .coerceIn(0f, 1f)
    val score = if (instruction.expectedDirection != null) {
        val matches = values.zipWithNext()
            .count { (a, b) -> if (instruction.expectedDirection == "decrease") b <= a + 0.5f else b >= a - 0.5f }
        (matches.toFloat() / (values.size - 1) * confidence).coerceIn(0f, 1f)
    } else if (instruction.measurementRole == "proxy_alignment") {
        val paired = values.windowed(2).map { window -> abs(window[0] - window[1]) }
        (confidence * (1f - (paired.average().toFloat() / 180f).coerceIn(0f, 1f))).coerceIn(0f, 1f)
    } else {
        val range = (values.maxOrNull() ?: 0f) - (values.minOrNull() ?: 0f)
        (confidence * (1f - (range / 180f).coerceIn(0f, 1f))).coerceIn(0f, 1f)
    }
    val label = if (instruction.measurementRole == "proxy") "PROXY EVIDENCE" else "ANGLE EVIDENCE"
    val message =
        if (instruction.expectedDirection != null) "${instruction.expectedDirection} angle movement is evidenced." else "Existing angles provide proxy posture evidence."
    return if (score >= COMPLETION_THRESHOLD) CoachAssessment(score, "$label PASSED", message)
    else CoachAssessment(score, "$label IN PROGRESS", message)
}

@Composable
fun InstructionCoachMode(
    engine: ExerciseFormEngine,
    owner: LifecycleOwner,
    cameraPermissionGranted: Boolean,
    requestCameraPermission: () -> Unit,
    onExit: () -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val catalogExercises by produceState<List<CoachExercise>?>(initialValue = null, context) {
        value = withContext(Dispatchers.IO) { InstructionCoachCatalog(context).exercises }
    }
    var selectedExerciseIndex by remember { mutableStateOf<Int?>(null) }
    var instructionIndex by remember { mutableIntStateOf(0) }
    var voiceEnabled by remember { mutableStateOf(DEFAULT_VOICE_OVER_ENABLED) }
    var spokenInstructionKey by remember { mutableStateOf<String?>(null) }
    var cycleCount by remember { mutableIntStateOf(0) }
    var cycleStartToken by remember { mutableIntStateOf(0) }
    var cycleCounterVisible by remember { mutableStateOf(false) }
    val voiceOver = remember { VoiceOverQueue(context) }
    val observer by engine.movementObserverResults.collectAsState()
    var announcedCompletion by remember { mutableStateOf<String?>(null) }
    DisposableEffect(voiceOver) {
        onDispose { voiceOver.close() }
    }
    if (catalogExercises == null) {
        BackHandler(onBack = onExit)
        Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding(), contentAlignment = Alignment.Center) {
            Text("Loading exercise catalogue…", color = Color.White, fontSize = 20.sp)
        }
        return
    }
    val exercises = catalogExercises!!
    if (selectedExerciseIndex == null) {
        BackHandler(onBack = onExit)
        ExercisePicker(exercises) { index ->
            selectedExerciseIndex = index
            instructionIndex = 0
            cycleCount = 0
            cycleStartToken = 0
            cycleCounterVisible = false
            announcedCompletion = null
            spokenInstructionKey = null
            if (!cameraPermissionGranted) requestCameraPermission()
        }
        return
    }
    if (!cameraPermissionGranted) {
        BackHandler(onBack = { selectedExerciseIndex = null })
        Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding().padding(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${humanReadableExerciseName(exercises[selectedExerciseIndex!!].name)} selected", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Text("Camera permission is needed to start coaching.", color = Color.LightGray, fontSize = 16.sp)
                Button(onClick = requestCameraPermission) { Text("Allow camera") }
                OutlinedButton(onClick = { selectedExerciseIndex = null }) { Text("Choose another exercise") }
            }
        }
        return
    }
    val exerciseIndex = selectedExerciseIndex!!
    val exercise = exercises[exerciseIndex]
    if (exercise.instructions.isEmpty()) {
        BackHandler(onBack = { selectedExerciseIndex = null })
        Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding().padding(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(humanReadableExerciseName(exercise.name), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Text("No existing joint-angle measurement can score this exercise's instructions.", color = Color.LightGray, fontSize = 16.sp)
                Button(onClick = { selectedExerciseIndex = null }) { Text("Choose another exercise") }
            }
        }
        return
    }
    val instruction = exercise.instructions[instructionIndex]
    val assessment = remember(observer, instruction) { assess(instruction, observer) }

    LaunchedEffect(exercise.id, instruction.id, cycleStartToken) {
        val instructionKey = "${exercise.id}:${instruction.id}"
        spokenInstructionKey = null
        instruction.text?.takeIf { it.isNotBlank() }?.let {
            delay(250)
            voiceOver.sayAndWait(it)
        }
        spokenInstructionKey = instructionKey
        if (announcedCompletion == instructionKey) return@LaunchedEffect
        engine.movementObserverResults.first { result ->
            assess(instruction, result).score?.let { it >= COMPLETION_THRESHOLD } == true
        }
        if (announcedCompletion == instructionKey) return@LaunchedEffect
        announcedCompletion = instructionKey
        val isLastInstruction = instructionIndex == exercise.instructions.lastIndex
        if (isLastInstruction) voiceOver.sayAndWait("Awesome, keep doing it.")
        else voiceOver.sayAndWait("Excellent.")
        if (isLastInstruction) {
            val nextRep = cycleCount + 1
            cycleCount = nextRep
            cycleCounterVisible = true
            voiceOver.sayAndWait("Rep $nextRep.")
            delay(700)
            cycleCounterVisible = false
            announcedCompletion = null
            spokenInstructionKey = null
            instructionIndex = 0
            cycleStartToken += 1
        } else {
            delay(300)
            instructionIndex += 1
        }
    }
    BackHandler(onBack = onExit)
    Box(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .background(Color.Black)
    ) {
        ExerciseFormPreview(engine, context, owner, exerciseFormPreviewOptions {
            showJoints = true; showGraph = false; showPosture = false; showCameraToggle = true
        })
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 60.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(onClick = onExit) { Text("Exit") }
                Button(onClick = { selectedExerciseIndex = null }) { Text(humanReadableExerciseName(exercise.name)) }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Voice", color = Color.White, fontSize = 13.sp)
                Switch(checked = voiceEnabled, onCheckedChange = {
                    voiceEnabled = it
                    voiceOver.setEnabled(it)
                })
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(
                        bottom = 56.dp
                    )
                    .background(Color.Black.copy(.82f), MaterialTheme.shapes.medium)
                    .padding(16.dp)
            ) {
                if (cycleCounterVisible) {
                    Text("REP COUNTER", color = Color.LightGray, fontSize = 13.sp)
                    Text("$cycleCount", color = Color.Green, fontSize = 72.sp, fontWeight = FontWeight.Bold)
                    Text("Rep complete", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                    Text("Continuing ${humanReadableExerciseName(exercise.name)}", color = Color.LightGray, fontSize = 13.sp)
                } else {
                Text(
                    "INSTRUCTION ${instructionIndex + 1}/${exercise.instructions.size}",
                    color = Color.LightGray,
                    fontSize = 13.sp
                )
                Text(
                    instruction.text ?: "Missing catalogue instruction",
                    color = Color.White,
                    fontSize = 21.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(10.dp))
                Text("EXPERIMENTAL EVIDENCE SCORE", color = Color.LightGray, fontSize = 12.sp)
                Text(assessment.score?.let { String.format(Locale.US, "%.0f%%", it * 100) }
                    ?: "N/A",
                    color = if (assessment.score != null && assessment.score >= COMPLETION_THRESHOLD) Color.Green else Color.Yellow,
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold)
                Text(assessment.label, color = Color.White, fontWeight = FontWeight.Bold)
                Text(assessment.message, color = Color.White, fontSize = 14.sp)
                if (instruction.status == "partially_mapped") {
                    Text(
                        "Scoring mapped angle portion only; other clauses are skipped.",
                        color = Color.LightGray,
                        fontSize = 12.sp
                    )
                }
                if (instruction.measurementIds.isNotEmpty()) Text(
                    "Angles: ${instruction.measurementIds.joinToString()}",
                    color = Color.LightGray,
                    fontSize = 12.sp
                )
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    OutlinedButton(
                        enabled = instructionIndex > 0,
                        onClick = { instructionIndex -= 1 }) { Text("Previous") }
                    Button(
                        enabled = instructionIndex < exercise.instructions.lastIndex,
                        onClick = { instructionIndex += 1 }) { Text("Next") }
                }
                }
            }
        }
    }
}
