<template>
  <div class="home">
    <h1>Welcome Home!</h1>
    <p>You are authenticated.</p>
  </div>
</template>

<script setup lang="ts">
// Placeholder home component
</script>

<style scoped lang="scss">
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;

  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  p {
    font-size: 1.2rem;
    color: #666;
  }
}
</style>
