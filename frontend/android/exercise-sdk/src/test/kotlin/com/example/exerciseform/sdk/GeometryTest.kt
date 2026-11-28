package com.example.exerciseform.sdk
import com.example.exerciseform.sdk.biomechanics.*
import org.junit.Assert.assertEquals
import org.junit.Test
class GeometryTest { @Test fun rightAngle(){assertEquals(90f,Geometry.angle(Vec3(1f,0f,0f),Vec3(0f,0f,0f),Vec3(0f,1f,0f)),.01f)} }
