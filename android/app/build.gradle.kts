plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.lumio.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.lumio.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK can be sideloaded as is.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // The web interface (built by `npm run build` at the repo root) ships inside the APK.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("web"))
}

val copyWeb by tasks.registering(Copy::class) {
    val web = rootProject.file("../dist/client")
    doFirst {
        check(web.resolve("index.html").exists()) { "Run `npm run build` at the repo root first." }
    }
    from(web)
    into(layout.buildDirectory.dir("web/www"))
}
tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    val media3 = "1.5.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-ui:$media3")
}
