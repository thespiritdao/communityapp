import os

def list_directory(start_path, prefix=''):
    # Get a list of entries in the directory
    entries = os.listdir(start_path)
    entries_count = len(entries)

    for index, entry in enumerate(entries):
        full_path = os.path.join(start_path, entry)

        # Skip node_modules directories
        if entry == 'node_modules':
            continue

        # Determine if this is the last entry to decide on prefix
        connector = '└── ' if index == entries_count - 1 else '├── '

        # Print the entry
        print(prefix + connector + entry)

        # If it's a directory and not node_modules, recurse into it
        if os.path.isdir(full_path) and entry != 'node_modules':
            # Use a more indented prefix for children
            extension = '    ' if index == entries_count - 1 else '│   '
            list_directory(full_path, prefix + extension)

if __name__ == "__main__":
    base_directory = r"C:\Users\PC\Documents\DAO\App\commapp\src\identity"
    print(base_directory)
    list_directory(base_directory)
