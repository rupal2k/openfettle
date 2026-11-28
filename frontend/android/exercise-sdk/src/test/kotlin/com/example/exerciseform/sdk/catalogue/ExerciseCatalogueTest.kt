package com.example.exerciseform.sdk.catalogue

import org.junit.Assert.*
import org.junit.Test

class ExerciseCatalogueTest {
    private val valid = """{"schemaVersion":"1.0","source":"test","exercises":[{"id":"1","name":"Squat","category":"strength","bodyPart":"upper legs","equipment":"barbell","targetMuscles":["quads"],"secondaryMuscles":[],"instructions":["Stand"],"description":"A squat"}]}"""

    @Test fun parsesAndQueriesCatalogue() {
        val repo = ExerciseCatalogueRepository.fromJson(valid)
        assertEquals("Squat", repo.getById("1")?.name)
        assertEquals(1, repo.searchByName("squ").size)
        assertEquals(1, repo.byCategory("STRENGTH").size)
        assertEquals(1, repo.byEquipment("barbell").size)
        assertEquals(1, repo.byTargetMuscle("QUADS").size)
    }

    @Test fun convertsOpenGymFields() {
        val record = ExerciseCatalogueParser.parseOpenGymExercise("""{"id":"2","name":"Plank","category":"strength","bodyPart":"waist","equipment":"body weight","target":"abs","secondaryMuscles":[],"instructions":["Hold"],"description":"Hold it","hold":true,"needs":["mat"]}""")
        assertEquals(listOf("abs"), record.targetMuscles)
        assertTrue(record.tracking?.hold == true)
        assertEquals(listOf("mat"), record.tracking?.needs)
    }

    @Test fun rejectsMissingFields() { assertThrows(ExerciseCatalogueException::class.java) { ExerciseCatalogueParser.parseCatalogue(valid.replace("\"description\":\"A squat\"", "\"description\":\"\"")) } }

    @Test fun rejectsDuplicateIds() {
        assertThrows(ExerciseCatalogueException::class.java) { ExerciseCatalogueParser.parseCatalogue(valid.replace("}]}", "},{\"id\":\"1\",\"name\":\"Other\",\"category\":\"x\",\"bodyPart\":\"x\",\"equipment\":\"x\",\"target\":\"x\",\"instructions\":[\"x\"],\"description\":\"x\"}]}")) }
    }
}
