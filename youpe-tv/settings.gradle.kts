pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

/*
  Một project, ba module:

    :core    phần lõi dùng chung — gọi API, mô hình dữ liệu, trình phát, tải offline
    :app     giao diện Android TV (điều khiển bằng remote, tiêu điểm là chính)
    :mobile  giao diện điện thoại (chạm, vuốt, cửa sổ nổi)

  Tách như vậy vì hai giao diện khác nhau về bản chất — remote và ngón tay không
  dùng chung được một bố cục — nhưng phần khó thì giống hệt nhau. Sửa một lỗi ở
  :core là cả hai bản cùng được sửa.
*/
rootProject.name = "youpe-android"
include(":core")
include(":app")
include(":mobile")
