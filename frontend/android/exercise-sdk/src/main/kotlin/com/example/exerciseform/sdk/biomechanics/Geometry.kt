package com.example.exerciseform.sdk.biomechanics

import com.example.exerciseform.sdk.api.PoseLandmark
import kotlin.math.*

data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun minus(o: Vec3) = Vec3(x-o.x,y-o.y,z-o.z)
    fun dot(o: Vec3) = x*o.x+y*o.y+z*o.z
    fun length() = sqrt(dot(this).toDouble()).toFloat()
}
object Geometry {
    fun angle(a: Vec3, b: Vec3, c: Vec3): Float { val u=a-b; val v=c-b; val d=(u.length()*v.length()).coerceAtLeast(1e-6f); return Math.toDegrees(acos((u.dot(v)/d).coerceIn(-1f,1f).toDouble())).toFloat() }
    fun point(l: PoseLandmark) = Vec3(l.x,l.y,l.z)
    fun midpoint(a: PoseLandmark,b: PoseLandmark) = Vec3((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)
    fun distance(a: PoseLandmark,b: PoseLandmark) = (point(a)-point(b)).length()
}
