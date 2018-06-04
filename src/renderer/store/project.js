import path from 'path'
import { ipcRenderer, shell } from 'electron'
import { addFile, unlinkFile, changeFile, addDirectory, unlinkDirectory } from './treeCtrl'
import bus from '../bus'
import { create, paste, rename } from '../util/fileSystem'

const width = localStorage.getItem('side-bar-width')
const sideBarWidth = typeof +width === 'number' ? Math.max(+width, 180) : 280

const state = {
  sideBarWidth,
  activeItem: {},
  createCache: {},
  renameCache: null,
  clipboard: null,
  projectTree: null
}

const getters = {
  fileList: state => {
    const files = []
    const travel = folder => {
      files.push(...folder.files.filter(f => f.isMarkdown))
      for (const childFolder of folder.folders) {
        travel(childFolder)
      }
    }

    if (state.projectTree) travel(state.projectTree)
    return files.sort()
  }
}

const mutations = {
  SET_PROJECT_TREE (state, { pathname, name }) {
    state.projectTree = {
      pathname,
      name,
      isDirctory: true,
      isFile: false,
      isMarkdown: false,
      folders: [],
      files: []
    }
  },
  SET_SIDE_BAR_WIDTH (state, width) {
    localStorage.setItem('side-bar-width', Math.max(+width, 180))
    state.sideBarWidth = width
  },
  ADD_FILE (state, change) {
    const { projectTree } = state
    addFile(projectTree, change)
  },
  UNLINK_FILE (state, change) {
    const { projectTree } = state
    unlinkFile(projectTree, change)
  },
  CHANGE_FILE (state, change) {
    const { projectTree } = state
    changeFile(projectTree, change)
  },
  ADD_DIRECTORY (state, change) {
    const { projectTree } = state
    addDirectory(projectTree, change)
  },
  UNLINK_DIRECTORY (state, change) {
    const { projectTree } = state
    unlinkDirectory(projectTree, change)
  },
  SET_ACTIVE_ITEM (state, activeItem) {
    state.activeItem = activeItem
  },
  SET_CLIPBOARD (state, data) {
    state.clipboard = data
  },
  CREATE_PATH (state, cache) {
    state.createCache = cache
  },
  SET_RENAME_CACHE (state, cache) {
    state.renameCache = cache
  }
}

const actions = {
  LISTEN_FOR_LOAD_PROJECT ({ commit, dispatch }) {
    ipcRenderer.on('AGANI::open-project', (e, { pathname, name }) => {
      commit('SET_PROJECT_TREE', { pathname, name })
      commit('SET_LAYOUT', {
        rightColumn: 'files',
        showToolBar: true,
        showTabBar: false
      })
      dispatch('SET_LAYOUT_MENU_ITEM')
    })
  },
  LISTEN_FOR_UPDATE_PROJECT ({ commit }) {
    ipcRenderer.on('AGANI::update-object-tree', (e, { type, change }) => {
      switch (type) {
        case 'add':
          commit('ADD_FILE', change)
          break
        case 'unlink':
          commit('UNLINK_FILE', change)
          commit('SET_SAVE_STATUS_WHEN_REMOVE', change)
          break
        case 'change':
          commit('CHANGE_FILE', change)
          break
        case 'addDir':
          commit('ADD_DIRECTORY', change)
          break
        case 'unlinkDir':
          commit('UNLINK_DIRECTORY', change)
          break
        default:
          if (process.env.NODE_ENV === 'development') {
            console.log('unknown directory watch type')
          }
          break
      }
    })
  },
  CHANGE_SIDE_BAR_WIDTH ({ commit }, width) {
    commit('SET_SIDE_BAR_WIDTH', width)
  },
  CHANGE_ACTIVE_ITEM ({ commit }, activeItem) {
    commit('SET_ACTIVE_ITEM', activeItem)
  },
  CHANGE_CLIPBOARD ({ commit }, data) {
    commit('SET_CLIPBOARD', data)
  },
  ASK_FOR_OPEN_PROJECT ({ commit }) {
    ipcRenderer.send('AGANI::ask-for-open-project-in-sidebar')
  },
  LISTEN_FOR_SIDEBAR_CONTEXT_MENU ({ commit, state }) {
    bus.$on('SIDEBAR::show-in-folder', () => {
      const { pathname } = state.activeItem
      shell.showItemInFolder(pathname)
    })
    bus.$on('SIDEBAR::new', type => {
      const { pathname, isDirectory } = state.activeItem
      const dirname = isDirectory ? pathname : path.dirname(pathname)
      commit('CREATE_PATH', { dirname, type })
      bus.$emit('SIDEBAR::show-new-input')
    })
    bus.$on('SIDEBAR::remove', () => {
      const { pathname } = state.activeItem
      shell.moveItemToTrash(pathname)
    })
    bus.$on('SIDEBAR::copy-cut', type => {
      const { pathname: src } = state.activeItem
      commit('SET_CLIPBOARD', { type, src })
    })
    bus.$on('SIDEBAR::paste', () => {
      const { clipboard } = state
      const { pathname, isDirectory } = state.activeItem
      const dirname = isDirectory ? pathname : path.dirname(pathname)
      if (clipboard) {
        clipboard.dest = dirname + '/' + path.basename(clipboard.src)
        paste(clipboard)
          .then(() => {
            commit('SET_CLIPBOARD', null)
          })
          .catch(console.log.bind(console))
      }
    })
    bus.$on('SIDEBAR::rename', () => {
      const { pathname } = state.activeItem
      commit('SET_RENAME_CACHE', pathname)
      bus.$emit('SIDEBAR::show-rename-input')
    })
  },

  CREATE_FILE_DIRECTORY ({ commit, state }, name) {
    const { dirname, type } = state.createCache
    create(`${dirname}/${name}`, type)
      .then(() => {
        commit('CREATE_PATH', {})
      })
  },

  RENAME_IN_SIDEBAR ({ commit, state }, name) {
    const src = state.renameCache
    const dirname = path.dirname(src)
    const dest = dirname + '/' + name
    rename(src, dest)
      .then(() => {
        commit('RENAME_IF_NEEDED', { src, dest })
      })
  }
}

export default { state, getters, mutations, actions }
