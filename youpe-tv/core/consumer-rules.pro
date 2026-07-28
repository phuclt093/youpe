# Ktor và kotlinx.serialization dùng phản chiếu ở vài chỗ
-keep class com.youpe.core.data.** { *; }
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
