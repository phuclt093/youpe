plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.youpe.core"
    compileSdk = 35

    defaultConfig {
        // 21 là mức tối thiểu thực tế cho TV box đời cũ; điện thoại thì thoải mái hơn nhiều
        minSdk = 21
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(libs.androidx.core.ktx)
    api(libs.kotlinx.coroutines.android)
    api(libs.androidx.datastore.preferences)

    api(libs.media3.common)
    api(libs.media3.ui)
    api(libs.media3.exoplayer)
    api(libs.media3.exoplayer.dash)
    api(libs.media3.exoplayer.hls)
    api(libs.media3.session)
    api(libs.media3.database)
    api(libs.media3.datasource.okhttp)

    api(libs.ktor.client.core)
    api(libs.ktor.client.okhttp)
    api(libs.ktor.client.content.negotiation)
    api(libs.ktor.serialization.json)
    api(libs.kotlinx.serialization.json)
}
