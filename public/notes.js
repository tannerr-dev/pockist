let i = 1
function editNote(){
    console.log("well then", i)
    i++;
}

// local notes
let db;
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("textAreaDB", 1);

    request.onupgradeneeded = function(e) {
      db = e.target.result;
      db.createObjectStore("textAreaStore");
    };

    request.onsuccess = function(e) {
      db = e.target.result;
      resolve();
    };

    request.onerror = function(e) {
      reject(e);
    };
  });
}

async function saveDataToIndexedDB(value) {
  await openDB(); // Ensure db is opened
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["textAreaStore"], "readwrite");
    const store = transaction.objectStore("textAreaStore");

    // Put the value into the store
    const request = store.put({ value: value }, "singleRecord"); // Using "singleRecord" as key

    request.onsuccess = function() {
      resolve();
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}

async function getDataFromIndexedDB() {
  await openDB(); // Ensure db is opened
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["textAreaStore"], "readonly");
    const store = transaction.objectStore("textAreaStore");

    const request = store.get("singleRecord");

    request.onsuccess = function() {
      resolve(request.result?.value ?? '');
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}

let timeoutId;
const textArea = document.getElementById('box');

// Populate textarea on page load
async function init() {
  try {
    const storedValue = await getDataFromIndexedDB();
    textArea.value = storedValue;
  } catch (error) {
    console.error('Error fetching from IndexedDB:', error);
  }

  // Add event listener after initial population
  textArea.addEventListener('input', function() {
    clearTimeout(timeoutId); // Clear any pending timeout
    timeoutId = setTimeout(async () => {
      const currentValue = textArea.value;
      try {
        await saveDataToIndexedDB(currentValue);
        console.log('Changes saved to IndexedDB:', currentValue);
      } catch (error) {
        console.error('Error saving to IndexedDB:', error);
      }
    }, 1000); // Wait for 1 second before saving
  });
}

init();
