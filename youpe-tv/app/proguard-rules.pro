# kotlinx.serialization giữ lại metadata của các lớp @Serializable
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.youpe.tv.data.** { *; }
-keep,includedescriptorclasses class com.youpe.tv.data.**$$serializer { *; }
